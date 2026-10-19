-- Police vault database (a separate Supabase project from civic).
-- Architecture doc, decisions D2/D3 and "Police vault controls".
--
-- Access model:
--   anon key      used only by the intake Worker; can call police.submit_report() and nothing else
--   service role  used only by the web app's admin routes; every report read goes through
--                 police.read_report(), which writes police.access_log
-- Schema is "police", not "vault": Supabase reserves "vault" for its secrets store.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists police;
revoke all on schema police from public, anon, authenticated;
grant usage on schema police to anon, service_role;
alter default privileges in schema police revoke execute on functions from public;

create table police.reports (
  id uuid primary key default gen_random_uuid(),
  city text not null check (city in ('lagos', 'fct')),
  incident_type text not null check (incident_type in (
    'money_demanded', 'phone_searched_harassment', 'unlawful_arrest_detention', 'violence')),
  place text not null check (length(place) between 2 and 120),
  -- ~1 km grid cell ("row:col" at 0.01°). Exact coordinates are never stored.
  grid_cell text check (grid_cell ~ '^-?\d+:-?\d+$'),
  when_bucket text not null check (when_bucket in ('just_now', 'today', 'earlier')),
  occurred_on date,
  description text not null default '' check (length(description) <= 2000),
  -- RSA-OAEP + AES-GCM envelope (apps/police-intake/src/crypto.ts). Only the admin server can open it.
  officer_details_sealed text,
  media_keys text[] not null default '{}',
  consent_to_forward boolean not null,
  wants_legal_aid boolean not null default false,
  status text not null default 'new' check (status in ('new', 'verified', 'forwarded', 'closed', 'rejected')),
  status_code_salt text not null,
  status_code_hash text not null,
  created_at timestamptz not null default now(),
  forwarded_at timestamptz,
  closed_at timestamptz
);
create index on police.reports (created_at);
create index on police.reports (status_code_hash);

create table police.access_log (
  id bigint generated always as identity primary key,
  report_id uuid not null,
  moderator_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index on police.access_log (created_at desc);

alter table police.reports enable row level security;
alter table police.access_log enable row level security;
-- No policies: anon and authenticated can't touch the tables at all.
grant all on all tables in schema police to service_role;

-- The only thing the intake Worker can do: insert. It gets nothing back.
create or replace function police.submit_report(
  p_city text,
  p_incident_type text,
  p_place text,
  p_grid_cell text,
  p_when text,
  p_occurred_on date,
  p_description text,
  p_officer_details_sealed text,
  p_media_keys text[],
  p_consent_to_forward boolean,
  p_wants_legal_aid boolean,
  p_status_code_salt text,
  p_status_code_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into police.reports (
    city, incident_type, place, grid_cell, when_bucket, occurred_on, description,
    officer_details_sealed, media_keys, consent_to_forward, wants_legal_aid,
    status_code_salt, status_code_hash
  ) values (
    p_city, p_incident_type, p_place, p_grid_cell, p_when, p_occurred_on, coalesce(p_description, ''),
    p_officer_details_sealed, coalesce(p_media_keys, '{}'), p_consent_to_forward, coalesce(p_wants_legal_aid, false),
    p_status_code_salt, p_status_code_hash
  );
end;
$$;

revoke execute on function police.submit_report from public;
grant execute on function police.submit_report to anon;

-- Reads one report and logs who read it, in the same transaction.
create or replace function police.read_report(p_report_id uuid, p_moderator_id uuid)
returns setof police.reports
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into police.access_log (report_id, moderator_id, action) values (p_report_id, p_moderator_id, 'read');
  return query select * from police.reports where id = p_report_id;
end;
$$;

revoke execute on function police.read_report from public, anon, authenticated;
grant execute on function police.read_report to service_role;

-- Aggregates safe to publish: ~1 km cells, reports at least 48 hours old,
-- at least 3 reports per cell and incident type, for one calendar month.
create or replace function police.publishable_aggregates(p_period_start date)
returns table (city text, grid_cell text, incident_type text, report_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.city, r.grid_cell, r.incident_type, count(*)::integer
  from police.reports r
  where r.grid_cell is not null
    and r.status <> 'rejected'
    and r.created_at < now() - interval '48 hours'
    and r.created_at >= p_period_start
    and r.created_at < (p_period_start + interval '1 month')
  group by r.city, r.grid_cell, r.incident_type
  having count(*) >= 3;
$$;

revoke execute on function police.publishable_aggregates from public, anon, authenticated;

-- One-way bridge: pushes the current month's aggregates to the civic database.
-- Needs two Supabase Vault secrets in this project:
--   civic_ingest_url     https://<civic-ref>.supabase.co/rest/v1/rpc/ingest_police_patterns
--   civic_anon_key       the civic project's anon key
--   police_bridge_secret same random value as the civic project's police_bridge_secret
create or replace function police.push_aggregates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', now() - interval '48 hours')::date;
  v_url text;
  v_key text;
  v_secret text;
  v_rows jsonb;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'civic_ingest_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'civic_anon_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'police_bridge_secret';
  if v_url is null or v_key is null or v_secret is null then
    return;
  end if;

  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_rows
  from police.publishable_aggregates(v_period) a;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'apikey', v_key, 'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json', 'Content-Profile', 'public_read'),
    body := jsonb_build_object('p_secret', v_secret, 'p_period_start', v_period, 'p_rows', v_rows)
  );
end;
$$;

-- Retention: raw reports deleted 12 months after closing; access log kept 2 years.
create or replace function police.purge_expired()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from police.reports where closed_at < now() - interval '12 months';
  delete from police.access_log where created_at < now() - interval '2 years';
$$;

revoke execute on all functions in schema police from public, anon, authenticated;
grant execute on function police.submit_report to anon;
grant execute on all functions in schema police to service_role;

select cron.schedule('push-police-aggregates', '30 1 * * *', $$ select police.push_aggregates() $$);
select cron.schedule('purge-police-expired', '0 4 * * *', $$ select police.purge_expired() $$);
