-- pgTAP tests for the police patterns bridge (vault side). Run with: pnpm db:vault:test
-- Fixtures are obviously fake and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(14);

-- Two months ago is complete and past the 48-hour delay; this month is not.
create temp table m as
select
  (police.lagos_month(now()) - interval '2 months')::date as done,
  police.lagos_month(now()) as current;

create function pg_temp.report(p_city text, p_cell text, p_kind text, p_type text, p_at timestamptz, p_status text default 'new')
returns uuid language sql as $$
  insert into police.reports (city, grid_cell, kind, incident_type, place, when_bucket, consent_to_forward,
    status, status_code_salt, status_code_hash, created_at)
  values (p_city, p_cell, p_kind, p_type, 'Test place', 'today', true, p_status, 's', 'h', p_at)
  returning id;
$$;

-- Completed month: cell A has 3 valid + 1 rejected; cell B has 2; cell C has 7 commendations.
select pg_temp.report('lagos', '659:334', 'misconduct', 'money_demanded', (select done from m) + interval '3 days')
from generate_series(1, 3);
select pg_temp.report('lagos', '659:334', 'misconduct', 'money_demanded', (select done from m) + interval '4 days', 'rejected');
select pg_temp.report('lagos', '660:335', 'misconduct', 'violence', (select done from m) + interval '5 days')
from generate_series(1, 2);
select pg_temp.report('fct', '904:749', 'commendation', 'refused_bribe', (select done from m) + interval '6 days')
from generate_series(1, 7);
-- Current month: 4 in cell A, which must not be published yet.
select pg_temp.report('lagos', '659:334', 'misconduct', 'money_demanded', (select current from m) + interval '1 hour')
from generate_series(1, 4);

-- Bands and month rules -----------------------------------------------------------

select is(
  array[police.count_band(2), police.count_band(3), police.count_band(5), police.count_band(6),
        police.count_band(10), police.count_band(11), police.count_band(25), police.count_band(26)],
  array[null, '3-5', '3-5', '6-10', '6-10', '11-25', '11-25', '26+'],
  'counts map to bands at the edges, and under 3 has no band');
select ok(police.month_publishable((select done from m)), 'a month that ended over 48 hours ago is publishable');
select ok(not police.month_publishable((select current from m)), 'the current month is not');
select ok(not police.month_publishable((select done from m) + 1), 'only the first of a month names a period');
select is(police.lagos_month('2026-09-30 23:30:00+00'), '2026-10-01'::date, 'months follow Lagos time (23:30 UTC is 00:30 WAT)');

-- Patterns ---------------------------------------------------------------------------

select results_eq(
  $$ select city || '|' || grid_cell || '|' || kind || '|' || incident_type || '|' || band
     from police.publishable_aggregates((select done from m)) order by 1 $$,
  array['fct|904:749|commendation|refused_bribe|6-10', 'lagos|659:334|misconduct|money_demanded|3-5'],
  'completed month: cells with 3+ reports, as bands; rejected reports and smaller cells left out');
select is(
  (select count(*)::int from police.publishable_aggregates((select current from m))), 0,
  'the current month publishes nothing');
select ok(
  not exists (
    select 1 from pg_proc p, unnest(p.proargnames) a(name)
    where p.pronamespace = 'police'::regnamespace and p.proname = 'publishable_aggregates' and a.name like '%count%'),
  'no exact count leaves the vault');

-- Forwarding totals -------------------------------------------------------------------

insert into police.forwards (report_id, recipient, channel, outcome, forwarded_by, forwarded_at)
select id, 'cru', 'Test channel', o, '00000000-0000-0000-0000-0000000000aa', (select done from m) + interval '10 days'
from (select id, (array['acknowledged', 'no_response', 'awaiting'])[row_number() over (order by id)] o
      from police.reports where city = 'fct' limit 3) x;
insert into police.forwards (report_id, recipient, channel, forwarded_by, forwarded_at)
select id, 'psc', 'Test channel', '00000000-0000-0000-0000-0000000000aa', (select current from m) + interval '1 hour'
from police.reports where city = 'fct' limit 1;

select results_eq(
  $$ select city || '|' || recipient || '|' || forwarded || '|' || acknowledged || '|' || action_reported || '|' || no_response
     from police.forwarding_totals((select done from m)) $$,
  array['fct|cru|3|1|0|1'],
  'forwarding totals per completed month, city and recipient; this month left out');

-- push_aggregates ----------------------------------------------------------------------

select lives_ok($$ select police.push_aggregates() $$, 'push does nothing (and does not fail) without the bridge secrets');

-- Privileges -----------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'police.publishable_aggregates(date)', 'execute')
  and not has_function_privilege('anon', 'police.forwarding_totals(date)', 'execute')
  and not has_function_privilege('anon', 'police.push_aggregates()', 'execute'),
  'the Worker key cannot read aggregates or trigger the push');
select ok(has_function_privilege('anon', 'police.thread(text, text)', 'execute'), 'the Worker key keeps its status page access');
select ok(
  has_function_privilege('anon', 'police.submit_report(text, text, text, text, text, date, text, text, text[], boolean, boolean, text, text, text, text, text)', 'execute'),
  'the Worker key can still submit');
select ok(
  exists (select 1 from cron.job where jobname = 'push-police-aggregates'),
  'the nightly push is still scheduled');

select * from finish();
rollback;
