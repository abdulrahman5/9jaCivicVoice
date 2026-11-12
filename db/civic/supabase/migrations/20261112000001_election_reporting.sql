-- Election report flows (docs/ELECTIONS.md, task E4): which election is taking reports,
-- a status check by reference, and the photo key format.

-- The election taking reports right now, if any. Training elections only when asked.
create function election.current_election(p_include_training boolean default false)
returns setof election.elections
language sql
stable
security definer
set search_path = ''
as $$
  select * from election.elections
  where now() between opens_at and closes_at and (p_include_training or not is_training)
  order by opens_at
  limit 1;
$$;

-- The next real election to open, for "reporting opens on ..." messages.
create function election.next_election()
returns setof election.elections
language sql
stable
security definer
set search_path = ''
as $$
  select * from election.elections where opens_at > now() and not is_training order by opens_at limit 1;
$$;

-- What a reporter may see about their own report, by its reference: the unit, the category
-- and how the incident is labelled. Nothing about other reporters.
create function election.report_status(p_ref text)
returns table (ref_code text, election_name text, pu_code text, pu_name text, category_label text,
  label text, reject_reason text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.ref_code, e.name, r.pu_code, pu.name, c.label, i.label, i.reject_reason, r.created_at
  from election.reports r
  join election.incidents i on i.id = r.incident_id
  join election.elections e on e.id = r.election_id
  join election.polling_units pu on pu.code = r.pu_code
  join election.categories c on c.id = r.category
  where r.ref_code = upper(trim(p_ref));
$$;

-- Photos are stored by the server in the private media bucket, under election/.
alter table election.reports add constraint reports_media_keys_format check (
  array_to_string(media_keys, ',') ~ '^(election/[0-9a-f-]{36}\.jpg(,|$))*$'
);

revoke execute on all functions in schema election from public, anon, authenticated;
grant execute on all functions in schema election to service_role;
