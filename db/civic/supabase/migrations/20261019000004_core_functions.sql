-- core: status transitions, report submission, duplicate search.

-- Mirrors canTransition() in packages/validation/src/status.ts. Keep them in sync.
create or replace function core.can_transition(
  p_from core.issue_status, p_to core.issue_status, p_actor core.actor_type
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = 'received'  then (p_to in ('verified', 'rejected', 'merged') and p_actor = 'moderator')
    when p_from = 'verified'  then (p_to = 'forwarded' and p_actor in ('moderator', 'system'))
                                 or (p_to in ('rejected', 'merged') and p_actor = 'moderator')
    when p_from = 'forwarded' then p_to in ('acknowledged', 'in_progress', 'resolved') and p_actor in ('agency', 'moderator')
    when p_from = 'acknowledged' then p_to in ('in_progress', 'resolved') and p_actor in ('agency', 'moderator')
    when p_from = 'in_progress'  then p_to = 'resolved' and p_actor in ('agency', 'moderator')
    when p_from = 'resolved' then (p_to in ('confirmed_fixed', 'acknowledged') and p_actor in ('citizen', 'moderator'))
                                or (p_to = 'unconfirmed' and p_actor = 'system')
    when p_from = 'unconfirmed' then p_to in ('confirmed_fixed', 'acknowledged') and p_actor = 'citizen'
    else false
  end;
$$;

create or replace function core.change_status(
  p_issue_id uuid,
  p_to_status core.issue_status,
  p_actor_type core.actor_type,
  p_actor_id text default null,
  p_public_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from core.issue_status;
  v_event_id bigint;
begin
  select status into v_from from core.issues where id = p_issue_id for update;
  if v_from is null then
    raise exception 'issue % not found', p_issue_id using errcode = 'P0002';
  end if;
  if not core.can_transition(v_from, p_to_status, p_actor_type) then
    raise exception 'transition % -> % not allowed for %', v_from, p_to_status, p_actor_type
      using errcode = 'P0001';
  end if;

  update core.issues
  set status = p_to_status,
      updated_at = now(),
      resolved_at = case when p_to_status = 'resolved' then now() else resolved_at end,
      confirmed_at = case when p_to_status = 'confirmed_fixed' then now() else confirmed_at end
  where id = p_issue_id;

  insert into core.status_events (issue_id, from_status, to_status, actor_type, actor_id, public_note)
  values (p_issue_id, v_from, p_to_status, p_actor_type, p_actor_id, p_public_note)
  returning id into v_event_id;

  -- "verified" is silent to avoid noise (PRD status table).
  if p_to_status <> 'verified' then
    perform ops.enqueue('notify_citizen', 'status_event:' || v_event_id,
      jsonb_build_object('status_event_id', v_event_id, 'issue_id', p_issue_id));
  end if;

  return v_event_id;
end;
$$;

create or replace function core.title_for(p_category core.category, p_subcategory text)
returns text
language sql
immutable
set search_path = ''
as $$
  select initcap(replace(p_category::text, '_', ' ')) || ': ' || replace(p_subcategory, '_', ' ');
$$;

-- Open issues in the same category within p_radius_m metres, from the last 30 days (PRD F3).
create or replace function core.find_duplicates(
  p_category core.category, p_lat double precision, p_lng double precision, p_radius_m integer default 500
)
returns table (issue_id uuid, ref_code text, title text, metoo_count integer, distance_m double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.ref_code, i.title, i.metoo_count,
         extensions.st_distance(i.location, extensions.st_point(p_lng, p_lat, 4326)::extensions.geography)
  from core.issues i
  where i.category = p_category
    and i.status not in ('rejected', 'merged', 'confirmed_fixed', 'unconfirmed')
    and i.created_at > now() - interval '30 days'
    and extensions.st_dwithin(i.location, extensions.st_point(p_lng, p_lat, 4326)::extensions.geography, p_radius_m)
  order by 5
  limit 5;
$$;

-- Creates an issue + report + "received" event and enqueues triage, in one transaction.
create or replace function core.submit_report(
  p_city core.city,
  p_category core.category,
  p_subcategory text,
  p_lat double precision,
  p_lng double precision,
  p_location_text text,
  p_description text,
  p_since text,
  p_media_keys text[],
  p_contact_hash text,
  p_contact_encrypted text,
  p_language text,
  p_channel core.channel
)
returns table (report_id uuid, issue_id uuid, ref_code text, tracking_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_point extensions.geometry := case when p_lat is not null and p_lng is not null
    then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) end;
  v_lga text;
  v_ward text;
  v_issue_id uuid;
  v_report_id uuid;
  v_ref text;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_key text;
begin
  if v_point is not null then
    select l.name into v_lga from core.lgas l where extensions.st_contains(l.geom, v_point) limit 1;
    select w.name into v_ward from core.wards w where extensions.st_contains(w.geom, v_point) limit 1;
  end if;

  v_ref := case p_city when 'lagos' then 'LAG' else 'FCT' end || '-' || lpad(nextval('core.ref_seq')::text, 4, '0');

  insert into core.issues (ref_code, city, category, subcategory, title, location, location_text, lga, ward)
  values (v_ref, p_city, p_category, p_subcategory, core.title_for(p_category, p_subcategory),
          v_point::extensions.geography, p_location_text, v_lga, v_ward)
  returning id into v_issue_id;

  insert into core.reports (issue_id, channel, description, since, contact_hash, contact_encrypted, language, tracking_token_hash)
  values (v_issue_id, p_channel, coalesce(p_description, ''), p_since, p_contact_hash, p_contact_encrypted, coalesce(p_language, 'en'),
          encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning id into v_report_id;

  foreach v_key in array coalesce(p_media_keys, '{}') loop
    insert into core.media (report_id, storage_key, kind)
    values (v_report_id, v_key, case when v_key like '%.webm' or v_key like '%.ogg' or v_key like '%.m4a' then 'audio' else 'image' end);
  end loop;

  insert into core.status_events (issue_id, from_status, to_status, actor_type)
  values (v_issue_id, null, 'received', 'system');

  perform ops.enqueue('triage', 'report:' || v_report_id, jsonb_build_object('report_id', v_report_id));
  if exists (select 1 from core.media m where m.report_id = v_report_id and m.kind = 'audio') then
    perform ops.enqueue('transcribe', 'report:' || v_report_id, jsonb_build_object('report_id', v_report_id));
  end if;

  return query select v_report_id, v_issue_id, v_ref, v_token;
end;
$$;

-- "Is it fixed?" from the web: proves ownership with the tracking token.
create or replace function core.confirm_fix(p_ref_code text, p_tracking_token text, p_fixed boolean)
returns core.issue_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue_id uuid;
begin
  select i.id into v_issue_id
  from core.issues i
  join core.reports r on r.issue_id = i.id
  where i.ref_code = p_ref_code
    and r.tracking_token_hash = encode(extensions.digest(p_tracking_token, 'sha256'), 'hex');
  if v_issue_id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform core.change_status(v_issue_id, case when p_fixed then 'confirmed_fixed' else 'acknowledged' end::core.issue_status, 'citizen');
  return (select status from core.issues where id = v_issue_id);
end;
$$;

-- Nightly: resolved issues with no citizen reply for 14 days become "unconfirmed".
create or replace function core.sweep_unconfirmed()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from core.issues where status = 'resolved' and resolved_at < now() - interval '14 days'
  loop
    perform core.change_status(v_id, 'unconfirmed', 'system');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Retention (architecture doc, "Retention" table).
create or replace function core.purge_expired()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update core.reports r set contact_hash = null, contact_encrypted = null
  from core.issues i
  where r.issue_id = i.id and (r.contact_hash is not null or r.contact_encrypted is not null)
    and i.status in ('confirmed_fixed', 'unconfirmed', 'rejected', 'merged')
    and i.updated_at < now() - interval '90 days';

  delete from core.issues where status = 'rejected' and updated_at < now() - interval '30 days';
  delete from ops.idempotency_keys where created_at < now() - interval '7 days';
  delete from ops.bot_sessions where updated_at < now() - interval '1 day';
  delete from ops.audit_log where created_at < now() - interval '2 years';
end;
$$;
