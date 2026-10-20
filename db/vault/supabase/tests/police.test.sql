-- pgTAP tests for the police vault functions. Run with: pnpm db:vault:test
-- Fixtures are obviously fake and rolled back. Never use real or realistic reports here.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(41);

create temp table t as
select
  'lookupAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1'::text as lookup_a,
  'lookupBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB2'::text as lookup_b,
  'hash-a'::text as hash_a,
  'hash-b'::text as hash_b,
  '00000000-0000-0000-0000-0000000000aa'::uuid as moderator;

-- Intake ---------------------------------------------------------------------

select lives_ok(
  $$ select police.submit_report('lagos', 'money_demanded', 'Test junction', '659:334', 'today', null,
       'test description', null, '{}', true, false, 'salt-a', 'hash-a', 'misconduct', 'evening',
       (select lookup_a from t)) $$,
  'misconduct report with a lookup is accepted');
select lives_ok(
  $$ select police.submit_report('fct', 'refused_bribe', 'Test road', '904:749', 'earlier', null,
       '', null, '{}', false, false, 'salt-b', 'hash-b', 'commendation', null, (select lookup_b from t)) $$,
  'commendation is accepted');
select lives_ok(
  $$ select police.submit_report('lagos', 'violence', 'Test place', null, 'just_now', null,
       '', null, '{}', false, false, 'salt-c', 'hash-c') $$,
  'the current Worker call (no kind, time of day or lookup) still works');
select throws_ok(
  $$ select police.submit_report('lagos', 'refused_bribe', 'Test place', null, 'today', null,
       '', null, '{}', false, false, 's', 'h', 'misconduct') $$,
  '23514', null, 'a commendation type cannot be filed as misconduct');
select throws_ok(
  $$ select police.submit_report('lagos', 'money_demanded', 'Test place', null, 'today', null,
       '', null, '{}', false, false, 's', 'h', 'commendation') $$,
  '23514', null, 'a misconduct type cannot be filed as a commendation');

create temp table r as
select
  (select id from police.reports where status_lookup = (select lookup_a from t)) as a,
  (select id from police.reports where status_lookup = (select lookup_b from t)) as b;

-- Status page ------------------------------------------------------------------

select is(police.code_salt((select lookup_a from t)), 'salt-a', 'code_salt finds the salt by lookup');
select is(police.code_salt('lookupZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ9'), null, 'unknown lookup returns no salt');
select is(police.thread((select lookup_a from t), 'wrong-hash'), null, 'wrong code hash returns nothing');
select is(police.thread((select lookup_a from t), 'hash-a') ->> 'status', 'new', 'right code returns the status');
select is(police.thread((select lookup_a from t), 'hash-a') -> 'messages', '[]'::jsonb, 'no messages yet');

select lives_ok(
  $$ select police.post_message((select lookup_a from t), 'hash-a', '  first message  ') $$,
  'reporter can post with the right code');
select is(
  police.thread((select lookup_a from t), 'hash-a') -> 'messages' -> 0 ->> 'body', 'first message',
  'message is stored, trimmed');
select throws_ok(
  $$ select police.post_message((select lookup_a from t), 'wrong-hash', 'x') $$,
  'P0002', null, 'wrong code cannot post');
select lives_ok(
  $$ select police.post_message((select lookup_a from t), 'hash-a', 'm' || g) from generate_series(2, 5) g $$,
  'up to 5 reporter messages a day');
select throws_ok(
  $$ select police.post_message((select lookup_a from t), 'hash-a', 'sixth') $$,
  'P0001', 'daily message limit reached', 'sixth message in a day is refused');

-- Queue and statuses -------------------------------------------------------------

select is(
  (select unanswered_messages from police.list_reports('new') where id = (select a from r)), 5,
  'queue counts unanswered reporter messages');
select is(
  (select count(*)::int from police.list_reports('new')), 3, 'queue lists new reports');
select throws_ok(
  $$ select police.set_status((select a from r), (select moderator from t), 'forwarded') $$,
  'P0001', null, 'forwarded can only be set by recording a forward');
select throws_ok(
  $$ select police.set_status((select b from r), (select moderator from t), 'rejected', '  ') $$,
  'P0001', 'a rejection needs a reason', 'rejecting needs a reason');
select lives_ok(
  $$ select police.set_status((select a from r), (select moderator from t), 'consistent') $$,
  'new report can be marked consistent');
select lives_ok(
  $$ select police.set_status((select b from r), (select moderator from t), 'consistent') $$,
  'commendation can be marked consistent');

-- Forwarding -----------------------------------------------------------------------

select throws_ok(
  $$ select police.record_forward((select a from r), (select moderator from t), 'cru', 'CRU email') $$,
  'P0001', 'prepare the redacted forwarding text first', 'cannot forward without redacted text');
select lives_ok(
  $$ select police.save_forward_text((select a from r), (select moderator from t), 'Redacted account') $$,
  'moderator saves redacted forwarding text');
select is(
  (select description from police.reports where id = (select a from r)), 'test description',
  'original description is untouched');
select lives_ok(
  $$ select police.save_forward_text((select b from r), (select moderator from t), 'Redacted commendation') $$,
  'commendation gets forwarding text too');
select throws_ok(
  $$ select police.record_forward((select b from r), (select moderator from t), 'psc', 'PSC email') $$,
  'P0001', 'the reporter did not consent to forwarding', 'no consent, no forward');
select lives_ok(
  $$ select police.record_forward((select a from r), (select moderator from t), 'cru', 'CRU email', 'CRU-123') $$,
  'forward to the CRU is recorded');
select is((select status from police.reports where id = (select a from r)), 'forwarded', 'report is now forwarded');
select throws_ok(
  $$ select police.record_forward((select a from r), (select moderator from t), 'cru', 'again') $$,
  '23505', null, 'the same recipient cannot be recorded twice');
select lives_ok(
  $$ select police.record_forward((select a from r), (select moderator from t), 'psc', 'PSC email') $$,
  'forward to the PSC is recorded separately');
select is(
  (select string_agg(f ->> 'recipient' || ':' || (f ->> 'outcome'), ',')
   from jsonb_array_elements(police.thread((select lookup_a from t), 'hash-a') -> 'forwards') f),
  'cru:awaiting,psc:awaiting', 'reporter sees both forwards awaiting');

select lives_ok(
  $$ select police.set_forward_outcome((select a from r), (select moderator from t), 'cru', 'acknowledged') $$,
  'CRU acknowledgement recorded');
update police.forwards set forwarded_at = now() - interval '31 days' where report_id = (select a from r);
select is(police.sweep_forward_outcomes(), 1, 'sweep marks one stale forward');
select is(
  (select string_agg(recipient || ':' || outcome, ',' order by recipient) from police.forwards where report_id = (select a from r)),
  'cru:acknowledged,psc:no_response', 'only the forward still awaiting becomes no_response');

-- Replies and closing --------------------------------------------------------------

select lives_ok(
  $$ select police.reply((select a from r), (select moderator from t), 'Thanks, we have forwarded this.') $$,
  'moderator can reply');
select is(
  (select unanswered_messages from police.list_reports('forwarded') where id = (select a from r)), 0,
  'a reply clears the unanswered count');
select lives_ok(
  $$ select police.set_status((select a from r), (select moderator from t), 'closed') $$,
  'forwarded report can be closed');
select throws_ok(
  $$ select police.post_message((select lookup_a from t), 'hash-a', 'after close') $$,
  'P0001', 'this report is closed', 'no messages on a closed report');
select ok(
  (select count(*) from police.access_log where report_id = (select a from r)) = 7,
  'every moderator action on the report is logged');

-- Retention --------------------------------------------------------------------------

update police.reports set closed_at = now() - interval '13 months' where id = (select a from r);
do $$ begin perform police.purge_expired(); end $$;
select ok(
  not exists (select 1 from police.messages where report_id = (select a from r))
  and not exists (select 1 from police.forwards where report_id = (select a from r)),
  'purging a report removes its messages and forwards');

-- Privileges --------------------------------------------------------------------------

select ok(
  has_function_privilege('anon', 'police.code_salt(text)', 'execute')
  and has_function_privilege('anon', 'police.thread(text, text)', 'execute')
  and has_function_privilege('anon', 'police.post_message(text, text, text)', 'execute')
  and not has_function_privilege('anon', 'police.list_reports(text, integer)', 'execute')
  and not has_function_privilege('anon', 'police.read_report(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'police.set_status(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'police.record_forward(uuid, uuid, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'police.reply(uuid, uuid, text)', 'execute')
  and not has_table_privilege('anon', 'police.reports', 'select')
  and not has_table_privilege('anon', 'police.messages', 'select'),
  'the Worker key can use the status page functions and nothing else');

select * from finish();
rollback;
