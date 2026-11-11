-- pgTAP tests for the polling-unit import (task E2). Run with: pnpm db:civic:test
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(10);

create temp table payload as
select '{"code": 99, "name": "TEST LGA", "wards": [
  {"code": 1, "name": "WARD ONE", "units": [
    {"unit_no": 1, "name": "SCHOOL", "lat": 6.6, "lng": 3.3, "inec_id": 10},
    {"unit_no": 2, "name": "MARKET", "lat": null, "lng": null, "inec_id": 11}]},
  {"code": 2, "name": "WARD TWO", "units": [
    {"unit_no": 1, "name": "CLINIC", "lat": 6.7, "lng": 3.4, "inec_id": 12}]}]}'::jsonb as v;

select is(
  election.import_lga(24::smallint, (select v from payload)),
  '{"inserted": 3, "updated": 0, "unchanged": 0, "deactivated": 0}'::jsonb,
  'a new LGA inserts its wards and units');
select is(
  (select string_agg(code || ':' || name, ',' order by code) from election.polling_units where lga_code = 99),
  '24/99/01/001:SCHOOL,24/99/01/002:MARKET,24/99/02/001:CLINIC', 'units carry INEC codes');
select is(
  election.import_lga(24::smallint, (select v from payload)),
  '{"inserted": 0, "updated": 0, "unchanged": 3, "deactivated": 0}'::jsonb,
  'running it again changes nothing');

-- A fresh listing: one unit renamed, coordinates missing for another, one unit gone.
update payload set v = '{"code": 99, "name": "TEST LGA", "wards": [
  {"code": 1, "name": "WARD ONE", "units": [
    {"unit_no": 1, "name": "SCHOOL (RENAMED)", "lat": null, "lng": null, "inec_id": null},
    {"unit_no": 2, "name": "MARKET", "lat": 6.65, "lng": 3.35, "inec_id": 11}]},
  {"code": 2, "name": "WARD TWO", "units": []}]}'::jsonb;

select is(
  election.import_lga(24::smallint, (select v from payload)),
  '{"inserted": 0, "updated": 2, "unchanged": 0, "deactivated": 0}'::jsonb,
  'renames and new coordinates update; nothing is deactivated unless asked');
select is(
  (select name || '|' || lat || '|' || inec_id from election.polling_units where code = '24/99/01/001'),
  'SCHOOL (RENAMED)|6.60000|10', 'existing coordinates and INEC ids are kept when a listing lacks them');
select is((select lat from election.polling_units where code = '24/99/01/002'), 6.65000::numeric, 'new coordinates are taken');
select ok((select active from election.polling_units where code = '24/99/02/001'), 'the unit missing from the listing is still active');

select is(
  election.import_lga(24::smallint, (select v from payload), true),
  '{"inserted": 0, "updated": 0, "unchanged": 2, "deactivated": 1}'::jsonb,
  'with deactivate, a unit INEC no longer lists becomes inactive');
select ok(exists (select 1 from election.polling_units where code = '24/99/02/001' and not active), 'it stays in the table, inactive');

select throws_ok(
  $$ select election.import_lga(24::smallint, '{"code": 99, "name": "TEST LGA", "wards": []}'::jsonb, true) $$,
  'P0001', 'refusing to deactivate every unit in an LGA: the listing is empty',
  'an empty listing can''t deactivate a whole LGA');

select * from finish();
rollback;
