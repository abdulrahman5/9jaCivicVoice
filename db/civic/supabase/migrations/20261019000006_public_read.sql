-- public_read: everything the public internet may see. Read with the anon key.
-- Views run with their owner's rights (deliberately not security_invoker),
-- so anon never needs access to core. Only verified, non-merged issues appear,
-- and no column ever carries contact data.

create view public_read.issues_feed as
select
  i.ref_code, i.title, i.city, i.category, i.subcategory, i.lga, i.ward, i.status, i.metoo_count,
  round(extensions.st_y(i.location::extensions.geometry)::numeric, 4) as lat,
  round(extensions.st_x(i.location::extensions.geometry)::numeric, 4) as lng,
  a.name as agency_name,
  i.created_at, i.updated_at
from core.issues i
left join core.agencies a on a.id = i.agency_id
where i.status not in ('received', 'rejected', 'merged');

create view public_read.issue_timeline as
select i.ref_code, e.to_status, e.public_note, e.actor_type, e.created_at
from core.status_events e
join core.issues i on i.id = e.issue_id
where i.status not in ('received', 'rejected', 'merged');

-- Scorecard (PRD F8): last 90 days, agencies with at least 10 forwarded issues.
create materialized view public_read.scorecard as
with forwarded as (
  select i.id, i.agency_id, i.city, i.status, min(e.created_at) as forwarded_at
  from core.issues i
  join core.status_events e on e.issue_id = i.id and e.to_status = 'forwarded'
  where i.agency_id is not null and e.created_at > now() - interval '90 days'
  group by i.id
),
firsts as (
  select f.*,
    (select min(e.created_at) from core.status_events e
      where e.issue_id = f.id and e.to_status in ('acknowledged', 'in_progress', 'resolved')) as acked_at,
    (select min(e.created_at) from core.status_events e
      where e.issue_id = f.id and e.to_status = 'resolved') as resolved_at
  from forwarded f
)
select
  a.id as agency_id,
  a.name as agency_name,
  f.city,
  count(*)::integer as reports,
  round(100.0 * count(*) filter (where f.acked_at <= f.forwarded_at + interval '7 days') / count(*), 1) as ack_within_7d_pct,
  round((percentile_cont(0.5) within group (
    order by extract(epoch from (f.resolved_at - f.forwarded_at)) / 86400))::numeric, 1) as median_days_to_resolve,
  round(100.0 * count(*) filter (where f.status = 'confirmed_fixed')
    / nullif(count(*) filter (where f.status in ('confirmed_fixed', 'unconfirmed')), 0), 1) as confirmed_pct,
  now() as computed_at
from firsts f
join core.agencies a on a.id = f.agency_id
group by a.id, a.name, f.city
having count(*) >= 10;

create unique index on public_read.scorecard (agency_id, city);

-- Police patterns: written only by the nightly one-way bridge from the police vault.
-- Grid cells of ~1 km, at least 3 reports, at least 48 hours old (enforced in the vault).
create table public_read.police_patterns (
  city core.city not null,
  grid_cell text not null,
  incident_type text not null,
  period_start date not null,
  report_count integer not null check (report_count >= 3),
  primary key (city, grid_cell, incident_type, period_start)
);
alter table public_read.police_patterns enable row level security;
create policy police_patterns_public on public_read.police_patterns for select to anon, authenticated using (true);

grant select on all tables in schema public_read to anon, authenticated;
grant all on all tables in schema public_read to service_role;

-- The bridge authenticates with a shared secret stored in Supabase Vault
-- (select vault.create_secret('<random>', 'police_bridge_secret');) and can
-- only replace the rows for one period.
create or replace function public_read.ingest_police_patterns(p_secret text, p_period_start date, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
  v_count integer;
begin
  select decrypted_secret into v_expected from vault.decrypted_secrets where name = 'police_bridge_secret';
  if v_expected is null or p_secret is distinct from v_expected then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public_read.police_patterns where period_start = p_period_start;
  insert into public_read.police_patterns (city, grid_cell, incident_type, period_start, report_count)
  select (r->>'city')::core.city, r->>'grid_cell', r->>'incident_type', p_period_start, (r->>'report_count')::integer
  from jsonb_array_elements(p_rows) r
  where (r->>'report_count')::integer >= 3;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public_read.ingest_police_patterns(text, date, jsonb) from public;
grant execute on function public_read.ingest_police_patterns(text, date, jsonb) to anon, service_role;
