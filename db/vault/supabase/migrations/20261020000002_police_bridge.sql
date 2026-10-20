-- Police patterns bridge v1 (docs/POLICE.md, section 5; decided 20 Oct 2026):
--   * only COMPLETED months are published, at least 48 hours after the month ends (Lagos time)
--   * counts leave the vault only as bands (3-5, 6-10, 11-25, 26+), never exact numbers
--   * patterns are split by report kind (misconduct, commendation)
--   * monthly forwarding totals per city and recipient (CRU, PSC) are published too:
--     they describe the institutions' responses, not reporters
--
-- Needs these Supabase Vault secrets in this project:
--   civic_rest_url        https://<civic-ref>.supabase.co/rest/v1
--   civic_anon_key        the civic project's anon key
--   police_bridge_secret  same random value as the civic project's police_bridge_secret

-- Months are calendar months in Lagos (WAT, UTC+1 all year).
create function police.lagos_month(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select date_trunc('month', p_at at time zone 'Africa/Lagos')::date;
$$;

-- A month can be published once it has ended and 48 hours have passed.
create function police.month_publishable(p_period_start date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_period_start = date_trunc('month', p_period_start)::date
     and ((p_period_start + interval '1 month')::timestamp at time zone 'Africa/Lagos') + interval '48 hours' <= now();
$$;

create function police.count_band(p_count integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_count >= 26 then '26+'
    when p_count >= 11 then '11-25'
    when p_count >= 6 then '6-10'
    when p_count >= 3 then '3-5'
  end;
$$;

-- Replaces the v0 function, which returned exact counts and included the current month.
drop function police.publishable_aggregates(date);

-- ~1 km cells with at least 3 reports of one type in one completed month, as bands.
-- Returns nothing for a month that isn't publishable yet.
create function police.publishable_aggregates(p_period_start date)
returns table (city text, grid_cell text, kind text, incident_type text, band text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.city, r.grid_cell, r.kind, r.incident_type, police.count_band(count(*)::integer)
  from police.reports r
  where police.month_publishable(p_period_start)
    and r.grid_cell is not null
    and r.status <> 'rejected'
    and police.lagos_month(r.created_at) = p_period_start
  group by r.city, r.grid_cell, r.kind, r.incident_type
  having count(*) >= 3;
$$;

-- Forwards per completed month (by when they were sent), city and recipient, with current outcomes.
create function police.forwarding_totals(p_from date)
returns table (
  period_start date,
  city text,
  recipient text,
  forwarded integer,
  acknowledged integer,
  action_reported integer,
  no_response integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select police.lagos_month(f.forwarded_at), r.city, f.recipient,
    count(*)::integer,
    count(*) filter (where f.outcome = 'acknowledged')::integer,
    count(*) filter (where f.outcome = 'action_reported')::integer,
    count(*) filter (where f.outcome = 'no_response')::integer
  from police.forwards f
  join police.reports r on r.id = f.report_id
  where police.lagos_month(f.forwarded_at) >= p_from
    and police.month_publishable(police.lagos_month(f.forwarded_at))
  group by 1, 2, 3;
$$;

-- Nightly push to the civic database. Patterns: the last 3 completed months (the civic side
-- keeps the first copy of each month and ignores repeats, so a missed night is caught up and a
-- published month never changes). Forwarding totals: the last 6 months, refreshed, so late
-- acknowledgements count.
create or replace function police.push_aggregates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_secret text;
  v_headers jsonb;
  v_period date;
  v_this_month date := police.lagos_month(now());
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'civic_rest_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'civic_anon_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'police_bridge_secret';
  if v_url is null or v_key is null or v_secret is null then
    return;
  end if;
  v_headers := jsonb_build_object(
    'apikey', v_key, 'Authorization', 'Bearer ' || v_key,
    'Content-Type', 'application/json', 'Content-Profile', 'public_read');

  for v_period in
    select (v_this_month - make_interval(months => m))::date from generate_series(1, 3) m
  loop
    if police.month_publishable(v_period) then
      perform net.http_post(
        url := v_url || '/rpc/ingest_police_patterns',
        headers := v_headers,
        body := jsonb_build_object(
          'p_secret', v_secret,
          'p_period_start', v_period,
          'p_rows', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from police.publishable_aggregates(v_period) a))
      );
    end if;
  end loop;

  perform net.http_post(
    url := v_url || '/rpc/ingest_police_forwarding',
    headers := v_headers,
    body := jsonb_build_object(
      'p_secret', v_secret,
      'p_rows', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                 from police.forwarding_totals((v_this_month - interval '6 months')::date) t))
  );
end;
$$;

revoke execute on all functions in schema police from public, anon, authenticated;
grant execute on function police.submit_report(text, text, text, text, text, date, text, text, text[], boolean, boolean, text, text, text, text, text) to anon;
grant execute on function police.code_salt(text) to anon;
grant execute on function police.thread(text, text) to anon;
grant execute on function police.post_message(text, text, text) to anon;
grant execute on all functions in schema police to service_role;
