-- pgTAP tests for the election schema (task E1). Run with: pnpm db:civic:test
-- Fixtures are fake places and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(30);

-- Reference data ----------------------------------------------------------------------

select is((select count(*)::int from election.states), 37, '36 states and the FCT');
select is((select name from election.states where code = 24), 'Lagos', 'INEC codes the states alphabetically (Lagos is 24)');
select is((select name from election.states where code = 37), 'Federal Capital Territory', 'and the FCT last, as 37');
select is((select count(*)::int from election.categories), 19, '19 categories');
select is(
  (select string_agg(id, ',' order by id) from election.categories where public_detail = 'ward'),
  'intimidation,violence', 'violence and intimidation are never shown below ward level');
select is(
  (select count(*)::int from election.election_states where election_id = '2027-presidential-nass'), 37,
  'presidential and NASS polls are held in every state and the FCT');
select ok(
  not exists (select 1 from election.election_states where election_id = '2027-governorship-sha' and state_code = 37)
  and (select count(*)::int from election.election_states where election_id = '2027-governorship-sha') = 36,
  'governorship and state assembly polls: the 36 states, not the FCT');

-- Polling-unit codes ------------------------------------------------------------------

select is(election.normalize_pu_code('24/02/01/003'), '24/02/01/003', 'INEC form is kept');
select is(election.normalize_pu_code(' 24-2-1-3 '), '24/02/01/003', 'dashes and missing zeros are fixed');
select is(election.normalize_pu_code('24 02 01 003'), '24/02/01/003', 'spaces work');
select is(election.normalize_pu_code('240201003'), '24/02/01/003', 'nine digits in a row work');
select ok(
  election.normalize_pu_code('24/02/01') is null and election.normalize_pu_code('abc') is null
  and election.normalize_pu_code('24/02/00/003') is null and election.normalize_pu_code('124/02/01/003') is null,
  'anything else is not a code');

-- Fixtures: one Lagos and one FCT unit, and a practice election open now. LGA codes 90+
-- are above any real LGA (the highest is 44), so these never collide with loaded data.

insert into election.lgas (state_code, code, name) values (24, 90, 'Test LGA'), (37, 91, 'Test Area Council');
insert into election.wards (state_code, lga_code, code, name) values (24, 90, 1, 'Test Ward'), (37, 91, 1, 'Test Ward FCT');
insert into election.polling_units (state_code, lga_code, ward_code, unit_no, name)
values (24, 90, 1, 3, 'Test School I'), (37, 91, 1, 2, 'Test Market');
select is((select code from election.polling_units where name = 'Test School I'), '24/90/01/003', 'units carry INEC''s code');

insert into election.elections (id, name, polls_on, opens_at, closes_at, is_training)
values ('practice', 'Practice', current_date, now() - interval '1 hour', now() + interval '1 day', true),
       ('practice-states-only', 'Practice (no FCT)', current_date, now() - interval '1 hour', now() + interval '1 day', true),
       ('practice-closed', 'Practice closed', current_date, now() - interval '2 days', now() - interval '1 day', true);
insert into election.election_states (election_id, state_code)
select 'practice', code from election.states;
insert into election.election_states (election_id, state_code)
select 'practice-states-only', code from election.states where code <> 37;
insert into election.election_states (election_id, state_code) values ('practice-closed', 24);

create function pg_temp.report(p_code text, p_category text, p_sender text, p_election text default 'practice')
returns table (ref_code text, label text) language sql as $$
  select * from election.submit_report(p_election, p_code, p_category, '', '{}', 'web', p_sender);
$$;

-- Submitting --------------------------------------------------------------------------

select matches(
  (select ref_code from pg_temp.report('24-90-1-3', 'late_opening', repeat('a', 32))),
  '^EV-[2-9A-HJ-NP-Z]{7}$', 'a report gets a short reference, from a code typed loosely');
select is(
  (select label || '|' || sender_count from election.incidents where category = 'late_opening'),
  'reported|1', 'one report: one incident, labelled reported');
select throws_ok(
  $$ select * from pg_temp.report('24/90/01/003', 'late_opening', repeat('a', 32)) $$,
  'P0001', 'you have already reported this at this polling unit', 'the same sender can''t report the same thing twice');
select is((select label from pg_temp.report('24/90/01/003', 'late_opening', repeat('b', 32))), 'reported',
  'a second sender: still reported');
select is((select label from pg_temp.report('24/90/01/003', 'late_opening', repeat('c', 32))), 'corroborated',
  'a third independent sender within 2 hours: corroborated');
select is(
  (select sender_count || '|' || (select count(*) from election.reports r where r.incident_id = i.id)
   from election.incidents i where category = 'late_opening'),
  '3|3', 'reports join the one incident for that unit and category');

update election.reports set created_at = now() - interval '3 hours' where sender_hash in (repeat('d', 32), repeat('e', 32));
select pg_temp.report('24/90/01/003', 'vote_buying', repeat('d', 32));
select pg_temp.report('24/90/01/003', 'vote_buying', repeat('e', 32));
update election.reports set created_at = now() - interval '3 hours' where category = 'vote_buying';
select is((select label from pg_temp.report('24/90/01/003', 'vote_buying', repeat('f', 32))), 'reported',
  'three senders spread over more than 2 hours are not corroboration');

update election.incidents set label = 'verified' where category = 'vote_buying';
select is((select label from pg_temp.report('24/90/01/003', 'vote_buying', repeat('g', 32))), 'verified',
  'a moderator''s label isn''t changed by new reports');

-- Refusals ------------------------------------------------------------------------------

select throws_ok($$ select * from pg_temp.report('24/90/01/099', 'violence', repeat('h', 32)) $$,
  'P0002', 'no polling unit with that code', 'unknown polling unit');
select throws_ok($$ select * from pg_temp.report('nonsense', 'violence', repeat('h', 32)) $$,
  'P0001', 'that is not a polling unit code', 'not a code');
select throws_ok($$ select * from pg_temp.report('24/90/01/003', 'fire', repeat('h', 32)) $$,
  'P0001', 'unknown category', 'unknown category');
select throws_ok($$ select * from pg_temp.report('24/90/01/003', 'violence', repeat('h', 32), 'practice-closed') $$,
  'P0001', 'reporting is not open for this election', 'outside the reporting window');
select throws_ok($$ select * from pg_temp.report('37/91/01/002', 'violence', repeat('h', 32), 'practice-states-only') $$,
  'P0001', 'this election is not held in that state', 'a unit in a state where that election isn''t held');

select lives_ok(
  $$ select pg_temp.report('24/90/01/003', c.id, repeat('k', 32)) from election.categories c order by c.sort limit 10 $$,
  'a sender can make up to 10 reports an hour');
select throws_ok($$ select * from pg_temp.report('37/91/01/002', 'other', repeat('k', 32)) $$,
  'P0001', 'too many reports, please wait a while', 'and no more');

update election.polling_units set active = false where name = 'Test Market';
select throws_ok($$ select * from pg_temp.report('37/91/01/002', 'other', repeat('m', 32)) $$,
  'P0002', 'no polling unit with that code', 'inactive units take no new reports');

-- Privileges ------------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'election.submit_report(text, text, text, text, text[], text, text, text, text)', 'execute')
  and not has_table_privilege('anon', 'election.reports', 'select')
  and not has_table_privilege('anon', 'election.polling_units', 'select')
  and has_function_privilege('service_role', 'election.submit_report(text, text, text, text, text[], text, text, text, text)', 'execute'),
  'only the server (service role) can submit or read');

select * from finish();
rollback;
