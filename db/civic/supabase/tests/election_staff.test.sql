-- pgTAP tests for election moderators: scope, invites, the team, training (task E5).
-- Run with: pnpm db:civic:test
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(28);

-- Fixtures: Lagos LGAs 90 and 91 and an FCT LGA 90, a unit in each; a civic admin.
insert into election.lgas (state_code, code, name) values (24, 90, 'TEST LGA A'), (24, 91, 'TEST LGA B'), (37, 90, 'TEST FCT LGA');
insert into election.wards (state_code, lga_code, code, name) values (24, 90, 1, 'W A'), (24, 91, 1, 'W B'), (37, 90, 1, 'W F');
insert into election.polling_units (state_code, lga_code, ward_code, unit_no, name)
values (24, 90, 1, 1, 'UNIT A'), (24, 91, 1, 1, 'UNIT B'), (37, 90, 1, 1, 'UNIT F');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@test'),
  ('00000000-0000-4000-8000-0000000000c1', 'coord@test'),
  ('00000000-0000-4000-8000-0000000000d1', 'mod@test'),
  ('00000000-0000-4000-8000-0000000000d2', 'mod2@test'),
  ('00000000-0000-4000-8000-0000000000e1', 'late@test');
insert into ops.staff (user_id, display_name, role) values ('00000000-0000-4000-8000-0000000000a1', 'Ada Admin', 'admin');

create function pg_temp.uid(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-0000000000' || p)::uuid $$;

-- Scope ---------------------------------------------------------------------------------------

select is((select role from election.staff_scope(pg_temp.uid('a1'))), 'national_admin', 'civic admins are national admins');
select is((select count(*)::int from election.staff_scope(pg_temp.uid('d1'))), 0, 'people without a role have no scope');

-- Invites -------------------------------------------------------------------------------------

create temp table coord_invite as select * from election.create_invite(pg_temp.uid('a1'), 'state_coordinator', 24::smallint, null, 'Chidi');
select ok((select length(token) >= 32 from coord_invite), 'an invite has a long random token');
select is((select token_hash from election.invites where id = (select id from coord_invite)),
  encode(digest((select token from coord_invite), 'sha256'), 'hex'), 'only its hash is stored');

select is((select status || '|' || role || '|' || state_name || '|' || inviter from election.invite_details((select token from coord_invite))),
  'open|state_coordinator|Lagos|Ada Admin', 'the join page can say what the link is for');
select is((select count(*)::int from election.invite_details('not-a-token')), 0, 'unknown tokens find nothing');

select is((select role || '|' || state_code from election.redeem_invite((select token from coord_invite), pg_temp.uid('c1'), 'Chidi Coordinator')),
  'state_coordinator|24', 'redeeming makes a state coordinator');
select is((select role from ops.staff where user_id = pg_temp.uid('c1')), 'election_moderator', 'with a staff sign-in that only reaches the election console');
select throws_ok($$ select election.redeem_invite((select token from coord_invite), pg_temp.uid('d2'), 'Someone Else') $$,
  'P0001', 'that invite link has already been used', 'links are single use');
select is((select status from election.invite_details((select token from coord_invite))), 'used', 'and show as used');

select throws_ok($$ select election.create_invite(pg_temp.uid('c1'), 'state_coordinator', 24::smallint, null) $$,
  '42501', 'only national admins can invite state coordinators', 'coordinators cannot invite coordinators');
select throws_ok($$ select election.create_invite(pg_temp.uid('c1'), 'lga_moderator', 37::smallint, 90::smallint) $$,
  '42501', 'that area is outside yours', 'or invite outside their state');
select throws_ok($$ select election.create_invite(pg_temp.uid('c1'), 'lga_moderator', 24::smallint, 55::smallint) $$,
  '22023', 'choose an LGA in that state', 'the LGA must exist');

create temp table mod_invite as select * from election.create_invite(pg_temp.uid('c1'), 'lga_moderator', 24::smallint, 90::smallint);
create temp table mod2_invite as select * from election.create_invite(pg_temp.uid('c1'), 'lga_moderator', 24::smallint, 91::smallint);
select is((select count(*)::int from election.open_invites(pg_temp.uid('c1'))), 2, 'a coordinator sees their open invites');
select is((select count(*)::int from election.open_invites(pg_temp.uid('a1'))), 2, 'and so does a national admin');

select lives_ok($$ select election.redeem_invite((select token from mod_invite), pg_temp.uid('d1'), 'Dayo Moderator') $$, 'an LGA moderator joins');
select throws_ok($$ select election.create_invite(pg_temp.uid('d1'), 'lga_moderator', 24::smallint, 90::smallint) $$,
  '42501', 'you do not have permission to do that', 'LGA moderators cannot invite');

select lives_ok($$ select election.revoke_invite(pg_temp.uid('c1'), (select id from mod2_invite)) $$, 'a coordinator can cancel an invite');
select throws_ok($$ select election.redeem_invite((select token from mod2_invite), pg_temp.uid('d2'), 'Too Late') $$,
  'P0001', 'that invite link was cancelled', 'a cancelled link cannot be used');

update election.invites set expires_at = now() - interval '1 minute' where id = (select id from election.create_invite(pg_temp.uid('c1'), 'lga_moderator', 24::smallint, 91::smallint, 'old'));
select throws_ok($$ select election.redeem_invite((select token from election.create_invite(pg_temp.uid('c1'), 'lga_moderator', 24::smallint, 91::smallint)), pg_temp.uid('a1'), 'Admin Again') $$,
  'P0001', 'this account is already staff', 'existing staff cannot redeem a link');

-- The team and deactivation ----------------------------------------------------------------------

select is((select string_agg(display_name, ',') from election.team(pg_temp.uid('c1'))), 'Dayo Moderator', 'a coordinator manages their LGA moderators');
select is((select count(*)::int from election.team(pg_temp.uid('a1'))), 2, 'a national admin manages everyone');
select throws_ok($$ select election.set_staff_active(pg_temp.uid('d1'), pg_temp.uid('c1'), false) $$,
  '42501', null, 'moderators cannot deactivate their coordinator');

select election.set_staff_active(pg_temp.uid('c1'), pg_temp.uid('d1'), false);
select ok((select not active from ops.staff where user_id = pg_temp.uid('d1'))
  and (select count(*) = 0 from election.staff_scope(pg_temp.uid('d1'))), 'deactivating removes sign-in and scope at once');
select election.set_staff_active(pg_temp.uid('c1'), pg_temp.uid('d1'), true);

-- Training and practice ---------------------------------------------------------------------------

select throws_ok($$ select * from election.incidents_in_scope(pg_temp.uid('d1'), '2027-presidential-nass') $$,
  '42501', 'finish the training check first', 'untrained moderators cannot see real reports');
select ok((select election.seed_practice(pg_temp.uid('d1'))) >= 12, 'practice reports are made in the moderator''s LGA');
select ok((select bool_and(lga_name = 'TEST LGA A') and count(*) > 0 from election.incidents_in_scope(pg_temp.uid('d1'), 'practice')),
  'and the moderator sees only their LGA');
select is((select count(*)::int from election.current_election()), 0, 'practice never counts as a real election');

select * from finish();
rollback;
