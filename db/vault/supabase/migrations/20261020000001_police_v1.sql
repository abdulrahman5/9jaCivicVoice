-- Police reporting v1 (docs/POLICE.md): report kinds and commendations, status-code
-- lookup, moderation statuses, forwarding to the CRU and PSC, and the anonymous
-- message box.
--
-- Access model after this migration:
--   anon key      the intake Worker: submit a report, and read or post to ONE report's
--                 thread when it presents that report's status code. It can't list,
--                 search or read anything else.
--   service role  the web app's admin routes. Every moderator action goes through a
--                 function here that also writes police.access_log.

-- ---------------------------------------------------------------------------
-- Reports: kinds, commendation types, time of day, moderation fields
-- ---------------------------------------------------------------------------

alter table police.reports
  add column kind text not null default 'misconduct' check (kind in ('misconduct', 'commendation'));

alter table police.reports drop constraint reports_incident_type_check;
alter table police.reports add constraint reports_incident_type_check check (
  (kind = 'misconduct' and incident_type in (
    'money_demanded', 'phone_searched_harassment', 'unlawful_arrest_detention', 'violence'))
  or (kind = 'commendation' and incident_type in (
    'refused_bribe', 'helped_me', 'respected_rights', 'professional_conduct'))
);

-- Optional. Published only for cells with 10+ reports (docs/POLICE.md, section 5).
alter table police.reports
  add column time_of_day text check (time_of_day in ('morning', 'afternoon', 'evening', 'night'));

-- Police reports are "consistent", never "verified": we can't prove an anonymous report true.
update police.reports set status = 'consistent' where status = 'verified';
alter table police.reports drop constraint reports_status_check;
alter table police.reports add constraint reports_status_check
  check (status in ('new', 'consistent', 'forwarded', 'closed', 'rejected'));

-- Shown to the reporter on the status page.
alter table police.reports add column reject_reason text check (length(reject_reason) between 1 and 300);

-- The redacted copy a moderator prepares for the CRU and PSC. The original description is never edited.
alter table police.reports add column forward_text text check (length(forward_text) between 1 and 3000);

-- HMAC-SHA256(code, STATUS_LOOKUP_KEY), computed by the Worker. Finds the row; the salted
-- status_code_hash is still checked before anything is returned. Null for reports filed
-- before this migration (they can't use the message box).
alter table police.reports add column status_lookup text unique check (status_lookup ~ '^[A-Za-z0-9+/=_-]{32,64}$');

-- ---------------------------------------------------------------------------
-- Forwards: one row per recipient, so the CRU and PSC outcomes are tracked separately
-- ---------------------------------------------------------------------------

create table police.forwards (
  id bigint generated always as identity primary key,
  report_id uuid not null references police.reports (id) on delete cascade,
  recipient text not null check (recipient in ('cru', 'psc')),
  -- How it was sent, e.g. "CRU email" or "PSC web form".
  channel text not null check (length(channel) between 2 and 100),
  -- Reference number the CRU or PSC gave back, if any.
  reference text check (length(reference) between 1 and 100),
  outcome text not null default 'awaiting'
    check (outcome in ('awaiting', 'acknowledged', 'action_reported', 'no_response')),
  forwarded_by uuid not null,
  forwarded_at timestamptz not null default now(),
  outcome_at timestamptz,
  unique (report_id, recipient)
);
create index on police.forwards (forwarded_at) where outcome = 'awaiting';

-- ---------------------------------------------------------------------------
-- Message box: reporter and moderators, linked only by the status code
-- ---------------------------------------------------------------------------

create table police.messages (
  id bigint generated always as identity primary key,
  report_id uuid not null references police.reports (id) on delete cascade,
  author text not null check (author in ('reporter', 'moderator')),
  moderator_id uuid,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  check ((author = 'moderator') = (moderator_id is not null))
);
create index on police.messages (report_id, id);

alter table police.forwards enable row level security;
alter table police.messages enable row level security;
-- No policies: only the service role and the functions below touch these tables.
grant all on all tables in schema police to service_role;

-- ---------------------------------------------------------------------------
-- Intake (anon): submit_report gains kind, time of day and the lookup value.
-- New parameters have defaults, so the current Worker keeps working until it's updated.
-- ---------------------------------------------------------------------------

drop function police.submit_report(text, text, text, text, text, date, text, text, text[], boolean, boolean, text, text);

create function police.submit_report(
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
  p_status_code_hash text,
  p_kind text default 'misconduct',
  p_time_of_day text default null,
  p_status_lookup text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into police.reports (
    city, kind, incident_type, place, grid_cell, when_bucket, occurred_on, time_of_day, description,
    officer_details_sealed, media_keys, consent_to_forward, wants_legal_aid,
    status_code_salt, status_code_hash, status_lookup
  ) values (
    p_city, coalesce(p_kind, 'misconduct'), p_incident_type, p_place, p_grid_cell, p_when, p_occurred_on,
    p_time_of_day, coalesce(p_description, ''), p_officer_details_sealed, coalesce(p_media_keys, '{}'),
    p_consent_to_forward, coalesce(p_wants_legal_aid, false), p_status_code_salt, p_status_code_hash,
    p_status_lookup
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Status page (anon). The Worker computes the lookup, fetches the salt, computes the
-- slow hash, then calls thread() or post_message(), which check the hash themselves.
-- ---------------------------------------------------------------------------

create function police.code_salt(p_lookup text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select status_code_salt from police.reports where status_lookup = p_lookup;
$$;

-- Returns null when the code doesn't match. Dates only, never times or moderator ids.
create function police.thread(p_lookup text, p_code_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', r.kind,
    'incident_type', r.incident_type,
    'status', r.status,
    'reject_reason', r.reject_reason,
    'filed_on', r.created_at::date,
    'forwards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recipient', f.recipient, 'outcome', f.outcome, 'forwarded_on', f.forwarded_at::date) order by f.recipient)
      from police.forwards f where f.report_id = r.id), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'author', m.author, 'body', m.body, 'sent_on', m.created_at::date) order by m.id)
      from police.messages m where m.report_id = r.id), '[]'::jsonb)
  )
  from police.reports r
  where r.status_lookup = p_lookup and r.status_code_hash = p_code_hash;
$$;

create function police.post_message(p_lookup text, p_code_hash text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  select id, status into v_id, v_status
  from police.reports
  where status_lookup = p_lookup and status_code_hash = p_code_hash;
  if v_id is null then
    raise exception 'no report for this code' using errcode = 'P0002';
  end if;
  if v_status = 'closed' then
    raise exception 'this report is closed' using errcode = 'P0001';
  end if;
  if (select count(*) from police.messages
      where report_id = v_id and author = 'reporter' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'daily message limit reached' using errcode = 'P0001';
  end if;
  insert into police.messages (report_id, author, body) values (v_id, 'reporter', trim(p_body));
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderator console (service role). Every action is logged in police.access_log.
-- ---------------------------------------------------------------------------

-- The queue: no free text, so listing isn't logged. Opening a report uses read_report().
create function police.list_reports(p_status text default 'new', p_limit integer default 50)
returns table (
  id uuid,
  kind text,
  incident_type text,
  city text,
  status text,
  consent_to_forward boolean,
  created_at timestamptz,
  unanswered_messages integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.kind, r.incident_type, r.city, r.status, r.consent_to_forward, r.created_at,
    (select count(*)::integer from police.messages m
     where m.report_id = r.id and m.author = 'reporter'
       and m.id > coalesce((select max(m2.id) from police.messages m2
                            where m2.report_id = r.id and m2.author = 'moderator'), 0))
  from police.reports r
  where r.status = p_status
  order by r.created_at
  limit least(greatest(p_limit, 1), 200);
$$;

-- Moderators set new, consistent, rejected and closed. "forwarded" is set only by record_forward().
create function police.set_status(p_report_id uuid, p_moderator_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
begin
  select status into v_from from police.reports where id = p_report_id for update;
  if v_from is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if not (
    (v_from = 'new' and p_status in ('consistent', 'rejected'))
    or (v_from = 'consistent' and p_status in ('rejected', 'closed'))
    or (v_from = 'forwarded' and p_status = 'closed')
  ) then
    raise exception 'cannot move a report from % to %', v_from, p_status using errcode = 'P0001';
  end if;
  if p_status = 'rejected' and nullif(trim(p_reason), '') is null then
    raise exception 'a rejection needs a reason' using errcode = 'P0001';
  end if;

  update police.reports set
    status = p_status,
    reject_reason = case when p_status = 'rejected' then trim(p_reason) else reject_reason end,
    -- Rejected reports are closed too, so the 12-month purge applies to them.
    closed_at = case when p_status in ('rejected', 'closed') then now() else closed_at end
  where id = p_report_id;

  insert into police.access_log (report_id, moderator_id, action) values (p_report_id, p_moderator_id, 'status:' || p_status);
end;
$$;

create function police.save_forward_text(p_report_id uuid, p_moderator_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update police.reports set forward_text = nullif(trim(p_text), '')
  where id = p_report_id and status in ('consistent', 'forwarded');
  if not found then
    raise exception 'only consistent or forwarded reports can have forwarding text' using errcode = 'P0001';
  end if;
  insert into police.access_log (report_id, moderator_id, action) values (p_report_id, p_moderator_id, 'forward_text');
end;
$$;

-- Records that the moderator sent the forwarding pack to one recipient.
create function police.record_forward(
  p_report_id uuid,
  p_moderator_id uuid,
  p_recipient text,
  p_channel text,
  p_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r police.reports;
begin
  select * into r from police.reports where id = p_report_id for update;
  if r.id is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if not r.consent_to_forward then
    raise exception 'the reporter did not consent to forwarding' using errcode = 'P0001';
  end if;
  if r.status not in ('consistent', 'forwarded') then
    raise exception 'only consistent reports can be forwarded' using errcode = 'P0001';
  end if;
  if r.forward_text is null then
    raise exception 'prepare the redacted forwarding text first' using errcode = 'P0001';
  end if;

  insert into police.forwards (report_id, recipient, channel, reference, forwarded_by)
  values (p_report_id, p_recipient, trim(p_channel), nullif(trim(p_reference), ''), p_moderator_id);

  update police.reports set status = 'forwarded', forwarded_at = coalesce(forwarded_at, now())
  where id = p_report_id;

  insert into police.access_log (report_id, moderator_id, action) values (p_report_id, p_moderator_id, 'forward:' || p_recipient);
end;
$$;

create function police.set_forward_outcome(
  p_report_id uuid,
  p_moderator_id uuid,
  p_recipient text,
  p_outcome text,
  p_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('acknowledged', 'action_reported', 'no_response') then
    raise exception 'unknown outcome %', p_outcome using errcode = 'P0001';
  end if;
  update police.forwards set
    outcome = p_outcome,
    outcome_at = now(),
    reference = coalesce(nullif(trim(p_reference), ''), reference)
  where report_id = p_report_id and recipient = p_recipient;
  if not found then
    raise exception 'this report was not forwarded to %', p_recipient using errcode = 'P0002';
  end if;
  insert into police.access_log (report_id, moderator_id, action)
  values (p_report_id, p_moderator_id, 'outcome:' || p_recipient || ':' || p_outcome);
end;
$$;

create function police.reply(p_report_id uuid, p_moderator_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from police.reports where id = p_report_id and status <> 'closed') then
    raise exception 'report not found or closed' using errcode = 'P0001';
  end if;
  insert into police.messages (report_id, author, moderator_id, body)
  values (p_report_id, 'moderator', p_moderator_id, trim(p_body));
  insert into police.access_log (report_id, moderator_id, action) values (p_report_id, p_moderator_id, 'reply');
end;
$$;

-- Forwards with no update after 30 days count as "no response".
create function police.sweep_forward_outcomes()
returns integer
language sql
security definer
set search_path = ''
as $$
  with swept as (
    update police.forwards set outcome = 'no_response', outcome_at = now()
    where outcome = 'awaiting' and forwarded_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::integer from swept;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema police from public, anon, authenticated;
grant execute on function police.submit_report(text, text, text, text, text, date, text, text, text[], boolean, boolean, text, text, text, text, text) to anon;
grant execute on function police.code_salt(text) to anon;
grant execute on function police.thread(text, text) to anon;
grant execute on function police.post_message(text, text, text) to anon;
grant execute on all functions in schema police to service_role;

select cron.schedule('sweep-police-forward-outcomes', '15 3 * * *', $$ select police.sweep_forward_outcomes() $$);
