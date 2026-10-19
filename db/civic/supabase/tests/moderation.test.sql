-- pgTAP tests for the moderation functions. Run with: pnpm db:civic:test
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(17);

-- Fixtures: two Lagos issues near each other, one Abuja agency, one Lagos agency.
insert into core.agencies (id, name, city, categories)
values ('00000000-0000-0000-0000-00000000a001', 'Test DisCo', 'lagos', '{electricity}'),
       ('00000000-0000-0000-0000-00000000a002', 'Test FCT Water', 'fct', '{water}');

select results_eq(
  $$ select count(*)::int from core.submit_report('lagos', 'electricity', 'outage', 6.60, 3.345, null, 'first', null, '{}', null, null, 'en', 'web') $$,
  array[1], 'first report created');
select results_eq(
  $$ select count(*)::int from core.submit_report('lagos', 'electricity', 'outage', 6.6003, 3.3452, null, 'second', null, '{}', null, null, 'en', 'web') $$,
  array[1], 'second report created');
select results_eq(
  $$ select count(*)::int from core.submit_report('lagos', 'roads', 'pothole', null, null, 'Allen Avenue', 'typed place', null, '{}', null, null, 'en', 'whatsapp') $$,
  array[1], 'report with a typed place created');

create temp table t as
select
  (select id from core.issues where title like 'Electricity%' order by ref_code limit 1) as first_id,
  (select id from core.issues where title like 'Electricity%' order by ref_code desc limit 1) as second_id,
  (select id from core.issues where location is null) as typed_id,
  '00000000-0000-0000-0000-0000000000aa'::uuid as moderator;

-- moderate_update
select lives_ok(
  $$ select core.moderate_update((select typed_id from t), (select moderator from t), 'roads', 'flooding', 6.61, 3.34) $$,
  'moderator can place a typed-location issue and change its sub-category');
select results_eq(
  $$ select subcategory || '|' || coalesce(lga, '-') from core.issues where id = (select typed_id from t) $$,
  array['flooding|Ikeja'], 'placing the pin fills the LGA');
select ok(exists (select 1 from ops.audit_log where action = 'issue:edit'), 'edits are audited');

-- route_issue
select throws_ok(
  $$ select core.route_issue((select first_id from t), '00000000-0000-0000-0000-00000000a002', (select moderator from t)) $$,
  'P0001', null, 'cannot route to an agency in another city');
select lives_ok(
  $$ select core.route_issue((select first_id from t), '00000000-0000-0000-0000-00000000a001', (select moderator from t)) $$,
  'routing a received issue verifies and forwards it');
select results_eq(
  $$ select status::text from core.issues where id = (select first_id from t) $$,
  array['forwarded'], 'issue is forwarded');
select results_eq(
  $$ select string_agg(to_status::text, ',' order by id) from core.status_events where issue_id = (select first_id from t) $$,
  array['received,verified,forwarded'], 'status history records verify then forward');

-- merge_issue
select throws_ok(
  $$ select core.merge_issue((select first_id from t), (select first_id from t), (select moderator from t)) $$,
  'P0001', null, 'cannot merge an issue into itself');
select lives_ok(
  $$ select core.merge_issue((select second_id from t), (select first_id from t), (select moderator from t)) $$,
  'duplicate merges into the open issue');
select results_eq(
  $$ select count(*)::int from core.reports where issue_id = (select first_id from t) $$,
  array[2], 'the duplicate''s report moved to the target');
select results_eq(
  $$ select metoo_count from core.issues where id = (select first_id from t) $$,
  array[1], 'the moved report counts as a Me too');
select results_eq(
  $$ select status::text || '|' || (merged_into = (select first_id from t))::text from core.issues where id = (select second_id from t) $$,
  array['merged|true'], 'duplicate is marked merged and points at the target');

-- reject_issue
select throws_ok(
  $$ select core.reject_issue((select typed_id from t), (select moderator from t), '') $$,
  'P0001', null, 'rejecting requires a reason');

-- Privileges: nobody but the service role can call moderation functions.
select ok(
  not has_function_privilege('anon', 'core.route_issue(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'core.merge_issue(uuid, uuid, uuid)', 'execute'),
  'anon and authenticated cannot execute moderation functions');

select * from finish();
rollback;
