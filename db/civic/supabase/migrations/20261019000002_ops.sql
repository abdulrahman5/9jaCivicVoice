-- ops: job queues, staff, agency tokens, audit log.

-- Queues (Supabase Queues / pgmq). One per job type, plus a dead-letter queue.
select pgmq.create('wa_inbound');
select pgmq.create('media_fetch');
select pgmq.create('transcribe');
select pgmq.create('triage');
select pgmq.create('notify_citizen');
select pgmq.create('forward_agency');
select pgmq.create('publish_media');
select pgmq.create('dead_letter');

-- Idempotency: Meta retries webhooks and people double-tap buttons.
create table ops.idempotency_keys (
  queue text not null,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (queue, key)
);

create or replace function ops.enqueue(p_queue text, p_idempotency_key text, p_message jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ops.idempotency_keys (queue, key) values (p_queue, p_idempotency_key)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  perform pgmq.send(p_queue, p_message || jsonb_build_object('idempotency_key', p_idempotency_key));
  return true;
end;
$$;

-- Worker access to pgmq (pgmq's own schema is not exposed over the API).
create or replace function ops.read_jobs(p_queue text, p_qty integer default 10, p_visibility_seconds integer default 60)
returns table (msg_id bigint, read_ct integer, message jsonb)
language sql
security definer
set search_path = ''
as $$
  select r.msg_id, r.read_ct, r.message from pgmq.read(p_queue, p_visibility_seconds, p_qty) r;
$$;

create or replace function ops.ack_job(p_queue text, p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete(p_queue, p_msg_id);
$$;

-- Moves a job that keeps failing to the dead-letter queue (the health check alerts on it).
create or replace function ops.dead_letter_job(p_queue text, p_msg_id bigint, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message jsonb;
begin
  -- The worker already holds the message (invisible to pgmq.read), so read the queue table directly.
  execute format('select message from pgmq.%I where msg_id = $1', 'q_' || p_queue)
    into v_message using p_msg_id;
  perform pgmq.send('dead_letter', jsonb_build_object(
    'queue', p_queue, 'msg_id', p_msg_id, 'error', left(p_error, 500),
    -- Drop the raw WhatsApp message: it carries the sender's phone number.
    'message', coalesce(v_message, '{}'::jsonb) - 'message'));
  perform pgmq.delete(p_queue, p_msg_id);
end;
$$;

-- WhatsApp conversation state, keyed by contact hash; purged after a day of inactivity.
create table ops.bot_sessions (
  contact_hash text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function ops.queue_health()
returns table (queue_name text, depth bigint, oldest_age_seconds integer)
language sql
security definer
set search_path = ''
as $$
  select m.queue_name, m.queue_length, m.oldest_msg_age_sec
  from pgmq.metrics_all() m;
$$;

-- Staff (moderators). Accounts are created by an admin; there is no sign-up.
create table ops.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'moderator', 'police_moderator')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Agency links: the jti of every signed token, so links can be revoked early.
create table ops.agency_tokens (
  jti text primary key,
  agency_id uuid not null,
  issue_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table ops.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_table text not null,
  target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on ops.audit_log (created_at desc);

-- Calls the job runner (POST /api/jobs/run on the web app). URL and key live in
-- Supabase Vault (the built-in secrets store), set once per environment:
--   select vault.create_secret('https://<site>/api/jobs/run', 'worker_url');
--   select vault.create_secret('<JOBS_SECRET>', 'worker_key');
create or replace function ops.invoke_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'worker_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'worker_key';
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;
