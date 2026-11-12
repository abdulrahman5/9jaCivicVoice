-- pgTAP tests for the election report flows (task E4). Run with: pnpm db:civic:test
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(9);

-- Which election takes reports ----------------------------------------------------------

select is((select count(*)::int from election.current_election()), 0, 'no election is open before polling day');
select is((select id from election.next_election()), '2027-presidential-nass', 'the next one is the presidential and NASS poll');

insert into election.elections (id, name, polls_on, opens_at, closes_at, is_training)
values ('practice', 'Practice', current_date, now() - interval '1 hour', now() + interval '1 day', true);
select is((select count(*)::int from election.current_election()), 0, 'a practice election is not a real one');
select is((select id from election.current_election(true)), 'practice', 'but can be asked for, for training');

-- Status by reference ------------------------------------------------------------------------

insert into election.election_states (election_id, state_code) values ('practice', 24);
insert into election.lgas (state_code, code, name) values (24, 90, 'TEST LGA');
insert into election.wards (state_code, lga_code, code, name) values (24, 90, 1, 'TEST WARD');
insert into election.polling_units (state_code, lga_code, ward_code, unit_no, name) values (24, 90, 1, 1, 'TEST SCHOOL');

create temp table r as
select * from election.submit_report('practice', '24/90/01/001', 'vote_buying', 'cash at the queue',
  array['election/0b1c2d3e-4f50-4617-8899-aabbccddeeff.jpg'], 'web', repeat('a', 32));

select is(
  (select pu_code || '|' || pu_name || '|' || category_label || '|' || label from election.report_status((select ref_code from r))),
  '24/90/01/001|TEST SCHOOL|Vote buying|reported', 'a reporter can check their report by reference');
select is(
  (select count(*)::int from election.report_status(lower((select ref_code from r)) || '  ')), 1,
  'references are matched regardless of case and spaces');
select is((select count(*)::int from election.report_status('EV-AAAAAAA')), 0, 'unknown references find nothing');

-- Photo keys ----------------------------------------------------------------------------------

select throws_ok(
  $$ select election.submit_report('practice', '24/90/01/001', 'violence', '', array['../core/secret.jpg'], 'web', repeat('b', 32)) $$,
  '23514', null, 'photo keys must be election photos in the private bucket');

select ok(
  not has_function_privilege('anon', 'election.report_status(text)', 'execute')
  and not has_function_privilege('anon', 'election.current_election(boolean)', 'execute'),
  'served by the web app, not to anon');

select * from finish();
rollback;
