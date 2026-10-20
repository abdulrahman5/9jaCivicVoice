-- Police patterns bridge v1, civic side (docs/POLICE.md, section 5; decided 20 Oct 2026).
-- The vault pushes:
--   * patterns for COMPLETED months, with counts as bands only. The first copy of a month is
--     kept and later pushes are ignored, so published figures never change day to day (a
--     changing count could date an individual report).
--   * monthly forwarding totals per city and recipient, refreshed nightly.
-- Both ingest functions need the shared secret (Vault secret police_bridge_secret).

drop function public_read.ingest_police_patterns(text, date, jsonb);
drop table public_read.police_patterns;

-- Months that have been published, so pages can say what period the data covers.
create table public_read.police_periods (
  period_start date primary key check (period_start = date_trunc('month', period_start)::date),
  published_at timestamptz not null default now()
);

create table public_read.police_patterns (
  period_start date not null references public_read.police_periods (period_start),
  city core.city not null,
  grid_cell text not null check (grid_cell ~ '^-?\d+:-?\d+$'),
  kind text not null check (kind in ('misconduct', 'commendation')),
  incident_type text not null check (length(incident_type) between 2 and 40),
  band text not null check (band in ('3-5', '6-10', '11-25', '26+')),
  primary key (period_start, city, grid_cell, incident_type)
);

create table public_read.police_forwarding (
  period_start date not null check (period_start = date_trunc('month', period_start)::date),
  city core.city not null,
  recipient text not null check (recipient in ('cru', 'psc')),
  forwarded integer not null check (forwarded >= 0),
  acknowledged integer not null check (acknowledged >= 0),
  action_reported integer not null check (action_reported >= 0),
  no_response integer not null check (no_response >= 0),
  updated_at timestamptz not null default now(),
  primary key (period_start, city, recipient),
  check (acknowledged + action_reported + no_response <= forwarded)
);

alter table public_read.police_periods enable row level security;
alter table public_read.police_patterns enable row level security;
alter table public_read.police_forwarding enable row level security;
create policy police_periods_public on public_read.police_periods for select to anon, authenticated using (true);
create policy police_patterns_public on public_read.police_patterns for select to anon, authenticated using (true);
create policy police_forwarding_public on public_read.police_forwarding for select to anon, authenticated using (true);
grant select on public_read.police_periods, public_read.police_patterns, public_read.police_forwarding to anon, authenticated;
grant all on public_read.police_periods, public_read.police_patterns, public_read.police_forwarding to service_role;

create function public_read.check_bridge_secret(p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_expected text;
begin
  select decrypted_secret into v_expected from vault.decrypted_secrets where name = 'police_bridge_secret';
  if v_expected is null or p_secret is distinct from v_expected then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Returns the number of rows stored: 0 when the month was already published.
create function public_read.ingest_police_patterns(p_secret text, p_period_start date, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public_read.check_bridge_secret(p_secret);
  if p_period_start is distinct from date_trunc('month', p_period_start)::date
     or p_period_start >= date_trunc('month', now() at time zone 'Africa/Lagos')::date then
    raise exception 'only completed months can be published' using errcode = 'P0001';
  end if;

  insert into public_read.police_periods (period_start) values (p_period_start) on conflict do nothing;
  if not found then
    return 0;
  end if;

  insert into public_read.police_patterns (period_start, city, grid_cell, kind, incident_type, band)
  select p_period_start, (r->>'city')::core.city, r->>'grid_cell', r->>'kind', r->>'incident_type', r->>'band'
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public_read.ingest_police_forwarding(p_secret text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public_read.check_bridge_secret(p_secret);
  insert into public_read.police_forwarding as f
    (period_start, city, recipient, forwarded, acknowledged, action_reported, no_response)
  select (r->>'period_start')::date, (r->>'city')::core.city, r->>'recipient',
    (r->>'forwarded')::integer, (r->>'acknowledged')::integer,
    (r->>'action_reported')::integer, (r->>'no_response')::integer
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where (r->>'period_start')::date < date_trunc('month', now() at time zone 'Africa/Lagos')::date
  on conflict (period_start, city, recipient) do update set
    forwarded = excluded.forwarded,
    acknowledged = excluded.acknowledged,
    action_reported = excluded.action_reported,
    no_response = excluded.no_response,
    updated_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public_read.check_bridge_secret(text) from public, anon, authenticated;
revoke execute on function public_read.ingest_police_patterns(text, date, jsonb) from public;
revoke execute on function public_read.ingest_police_forwarding(text, jsonb) from public;
grant execute on function public_read.ingest_police_patterns(text, date, jsonb) to anon, service_role;
grant execute on function public_read.ingest_police_forwarding(text, jsonb) to anon, service_role;
