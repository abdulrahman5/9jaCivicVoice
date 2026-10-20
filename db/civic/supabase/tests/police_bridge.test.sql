-- pgTAP tests for the police patterns bridge (civic side). Run with: pnpm db:civic:test
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(15);

select vault.create_secret('test-bridge-secret', 'police_bridge_secret');
-- Start from empty published tables, even if demo.sql was loaded (rolled back at the end).
delete from public_read.police_patterns;
delete from public_read.police_periods;
delete from public_read.police_forwarding;

create temp table m as
select
  (date_trunc('month', now() at time zone 'Africa/Lagos') - interval '2 months')::date as done,
  (date_trunc('month', now() at time zone 'Africa/Lagos') - interval '1 month')::date as last,
  date_trunc('month', now() at time zone 'Africa/Lagos')::date as current;

-- Patterns ---------------------------------------------------------------------------

select throws_ok(
  $$ select public_read.ingest_police_patterns('wrong', (select done from m), '[]') $$,
  '42501', null, 'a wrong secret is refused');
select throws_ok(
  $$ select public_read.ingest_police_patterns('test-bridge-secret', (select current from m), '[]') $$,
  'P0001', 'only completed months can be published', 'the current month is refused');

select is(
  public_read.ingest_police_patterns('test-bridge-secret', (select done from m),
    '[{"city":"lagos","grid_cell":"659:334","kind":"misconduct","incident_type":"money_demanded","band":"3-5"},
      {"city":"fct","grid_cell":"904:749","kind":"commendation","incident_type":"refused_bribe","band":"6-10"}]'),
  2, 'a completed month is stored');
select is(
  public_read.ingest_police_patterns('test-bridge-secret', (select done from m),
    '[{"city":"lagos","grid_cell":"659:334","kind":"misconduct","incident_type":"money_demanded","band":"6-10"}]'),
  0, 'a second push for the same month is ignored');
select is(
  (select band from public_read.police_patterns where period_start = (select done from m) and grid_cell = '659:334'),
  '3-5', 'published figures never change');

select is(public_read.ingest_police_patterns('test-bridge-secret', (select last from m), '[]'), 0, 'an empty month is recorded');
select ok(exists (select 1 from public_read.police_periods where period_start = (select last from m)), 'its period is published');

select throws_ok(
  $$ select public_read.ingest_police_patterns('test-bridge-secret', ((select done from m) - interval '1 month')::date,
       '[{"city":"lagos","grid_cell":"1:1","kind":"misconduct","incident_type":"violence","band":"4"}]') $$,
  '23514', null, 'an exact count instead of a band is rejected');

-- Forwarding totals -------------------------------------------------------------------

select is(
  public_read.ingest_police_forwarding('test-bridge-secret', jsonb_build_array(
    jsonb_build_object('period_start', (select done from m), 'city', 'fct', 'recipient', 'cru',
      'forwarded', 3, 'acknowledged', 1, 'action_reported', 0, 'no_response', 1),
    jsonb_build_object('period_start', (select current from m), 'city', 'fct', 'recipient', 'psc',
      'forwarded', 1, 'acknowledged', 0, 'action_reported', 0, 'no_response', 0))),
  1, 'forwarding totals for completed months are stored; the current month is skipped');
select is(
  public_read.ingest_police_forwarding('test-bridge-secret', jsonb_build_array(
    jsonb_build_object('period_start', (select done from m), 'city', 'fct', 'recipient', 'cru',
      'forwarded', 3, 'acknowledged', 2, 'action_reported', 0, 'no_response', 1))),
  1, 'a later push refreshes the totals');
select is(
  (select acknowledged from public_read.police_forwarding where period_start = (select done from m)), 2,
  'late acknowledgements count');
select throws_ok(
  $$ select public_read.ingest_police_forwarding('test-bridge-secret', jsonb_build_array(
       jsonb_build_object('period_start', (select done from m), 'city', 'lagos', 'recipient', 'cru',
         'forwarded', 1, 'acknowledged', 1, 'action_reported', 1, 'no_response', 0))) $$,
  '23514', null, 'outcomes cannot exceed forwards');

-- Views for the patterns page -----------------------------------------------------------

select is(
  (select lga || '|' || lat || '|' || lng from public_read.police_areas where grid_cell = '659:334'),
  'Ikeja|6.595|3.345', 'a published cell gets its centre and the LGA containing it (seed boundaries)');
select ok(
  (select svg_path like 'M %' from public_read.lga_outlines where name = 'Ikeja'),
  'LGA outlines come as SVG path data');

-- Privileges -----------------------------------------------------------------------------

select ok(
  has_table_privilege('anon', 'public_read.police_patterns', 'select')
  and has_table_privilege('anon', 'public_read.police_forwarding', 'select')
  and has_table_privilege('anon', 'public_read.police_periods', 'select')
  and has_table_privilege('anon', 'public_read.police_areas', 'select')
  and has_table_privilege('anon', 'public_read.lga_outlines', 'select')
  and not has_table_privilege('anon', 'public_read.police_patterns', 'insert')
  and not has_table_privilege('anon', 'public_read.police_forwarding', 'update')
  and not has_function_privilege('anon', 'public_read.check_bridge_secret(text)', 'execute'),
  'the public can read the published tables but not write them');

select * from finish();
rollback;
