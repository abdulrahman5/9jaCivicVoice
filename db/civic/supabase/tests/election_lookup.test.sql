-- pgTAP tests for polling-unit lookup (task E3). Run with: pnpm db:civic:test
-- Fixtures use LGA codes 90+ (above any real LGA), so these pass with real data loaded.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(14);

insert into election.lgas (state_code, code, name) values (24, 90, 'TEST LGA'), (24, 91, 'OTHER LGA');
insert into election.wards (state_code, lga_code, code, name) values (24, 90, 1, 'TEST WARD'), (24, 91, 1, 'OTHER WARD');
insert into election.polling_units (state_code, lga_code, ward_code, unit_no, name, lat, lng, active) values
  (24, 90, 1, 1, 'ZQX ST. JOSEPH SECONDARY SCHOOL, ZQXMANGORO', 6.60980, 3.32920, true),
  (24, 90, 1, 2, 'ZQX OPEN SPACE BY ZQXMANGORO MARKET', 6.61000, 3.32950, true),
  (24, 90, 1, 3, 'ZQX OLD SCHOOL ZQXMANGORO (MOVED)', 6.61100, 3.33000, false),
  (24, 91, 1, 1, 'ZQX TOWN HALL ZQXMANGORO', null, null, true);

-- By code ---------------------------------------------------------------------------------

select is(
  (select code || '|' || ward_name || '|' || lga_name || '|' || state_name from election.find_unit('24-90-1-1')),
  '24/90/01/001|TEST WARD|TEST LGA|Lagos', 'finds a unit by a loosely typed code, with its ward, LGA and state');
select is((select active from election.find_unit('249001003')), false, 'an inactive unit is found, marked inactive');
select is((select count(*)::int from election.find_unit('24/90/01/099')), 0, 'unknown code: nothing');
select is((select count(*)::int from election.find_unit('not a code')), 0, 'not a code: nothing');

-- By name -----------------------------------------------------------------------------------

select is(
  (select string_agg(code, ',' order by code) from election.search_units('zqxmangoro', 24::smallint)),
  '24/90/01/001,24/90/01/002,24/91/01/001', 'name search within a state finds active units only');
select is(
  (select string_agg(code, ',' order by code) from election.search_units('ZQXMANGORO', 24::smallint, 91::smallint)),
  '24/91/01/001', 'and can be narrowed to an LGA, case-insensitively');
select is(
  (select code from election.search_units('zqx st. joseph', 24::smallint) limit 1), '24/90/01/001',
  'the closest match comes first');
select is(
  (select code from election.search_units('zqx st josef secondery', 24::smallint) limit 1), '24/90/01/001',
  'misspellings fall back to similar names');
select is((select count(*)::int from election.search_units('zqxmangoro', 37::smallint)), 0, 'other states are not searched');
select is((select count(*)::int from election.search_units('zqxmangoro', null)), 0, 'a state is required');
select is((select count(*)::int from election.search_units('zq', 24::smallint)), 0, 'under 3 characters: nothing');
select is((select count(*)::int from election.search_units('%_%', 24::smallint)), 0, 'wildcards are treated as text');

-- Near me -----------------------------------------------------------------------------------

select is(
  (select string_agg(code || '@' || distance_m, ',' order by distance_m) from election.units_near(6.6098, 3.3292, 5, 500)
   where code like '24/9_/%'),
  '24/90/01/001@0,24/90/01/002@40', 'nearest active units with a point, with distances in metres');

select ok(
  not has_function_privilege('anon', 'election.search_units(text, smallint, smallint, integer)', 'execute')
  and not has_function_privilege('anon', 'election.find_unit(text)', 'execute')
  and not has_table_privilege('anon', 'election.unit_directory', 'select'),
  'lookups are served by the web app, not directly to anon');

select * from finish();
rollback;
