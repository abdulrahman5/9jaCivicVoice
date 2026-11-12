-- Election moderators at national scale (docs/ELECTIONS.md, task E5).
--
-- Roles are scoped by geography: an LGA moderator works one LGA, a state coordinator a
-- whole state (and invites that state's LGA moderators), a national admin everything.
-- Civic admins (ops.staff role 'admin') count as national admins, so the first state
-- coordinators can be invited without a script. Volunteers join through single-use invite
-- links, set up two-factor at first sign-in like all staff, and pass a short training check
-- before they see real reports. A practice election holds fake reports for training.
--
-- Everything here is called by the web app with the service role, after it has checked the
-- signed-in staff member; the actor id is passed in and every function checks scope itself.

-- Election volunteers sign in like other staff but only see the election console.
alter table ops.staff drop constraint staff_role_check;
alter table ops.staff add constraint staff_role_check
  check (role in ('admin', 'moderator', 'police_moderator', 'election_moderator'));

create table election.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('lga_moderator', 'state_coordinator', 'national_admin')),
  state_code smallint references election.states (code),
  lga_code smallint,
  active boolean not null default true,
  trained_at timestamptz,
  invited_by uuid,
  created_at timestamptz not null default now(),
  check (
    (role = 'national_admin' and state_code is null and lga_code is null) or
    (role = 'state_coordinator' and state_code is not null and lga_code is null) or
    (role = 'lga_moderator' and state_code is not null and lga_code is not null)
  ),
  foreign key (state_code, lga_code) references election.lgas (state_code, code)
);
create index on election.staff (state_code, lga_code);

create table election.invites (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 of the token in the link; the token itself is shown once, to its creator.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role text not null check (role in ('lga_moderator', 'state_coordinator')),
  state_code smallint not null references election.states (code),
  lga_code smallint,
  -- Who it's for, so coordinators can tell open invites apart. Optional.
  note text not null default '' check (length(note) <= 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz,
  check ((role = 'lga_moderator') = (lga_code is not null)),
  foreign key (state_code, lga_code) references election.lgas (state_code, code)
);
create index on election.invites (state_code, created_at desc);
create index on election.invites (created_by, created_at desc);

alter table election.staff enable row level security;
alter table election.invites enable row level security;
grant all on election.staff, election.invites to service_role;

-- The practice election: open all season, never public, every state.
insert into election.elections (id, name, polls_on, opens_at, closes_at, is_training)
values ('practice', 'Practice election', '2026-12-01', '2026-11-01 00:00:00+01', '2027-12-31 23:59:00+01', true);
insert into election.election_states (election_id, state_code)
select 'practice', code from election.states;

-- ---------------------------------------------------------------------------
-- Scope
-- ---------------------------------------------------------------------------

-- A staff member's election role and area, or no row. Civic admins are national admins.
create function election.staff_scope(p_user uuid)
returns table (role text, state_code smallint, lga_code smallint, trained boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.role, s.state_code, s.lga_code, s.trained_at is not null
  from election.staff s
  join ops.staff o on o.user_id = s.user_id and o.active
  where s.user_id = p_user and s.active
  union all
  select 'national_admin', null::smallint, null::smallint, true
  from ops.staff o
  where o.user_id = p_user and o.active and o.role = 'admin'
    and not exists (select 1 from election.staff s where s.user_id = p_user)
  limit 1;
$$;

-- Whether an actor's area covers a state (and LGA, when given).
create function election.covers(p_actor uuid, p_state smallint, p_lga smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case s.role
      when 'national_admin' then true
      when 'state_coordinator' then s.state_code = p_state
      else s.state_code = p_state and p_lga is not null and s.lga_code = p_lga
    end
    from election.staff_scope(p_actor) s
  ), false);
$$;

create function election.require_role(p_actor uuid, p_roles text[])
returns election.staff
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope record;
  v_row election.staff;
begin
  select * into v_scope from election.staff_scope(p_actor);
  if v_scope.role is null or not v_scope.role = any (p_roles) then
    raise exception 'you do not have permission to do that' using errcode = '42501';
  end if;
  v_row.user_id := p_actor;
  v_row.role := v_scope.role;
  v_row.state_code := v_scope.state_code;
  v_row.lga_code := v_scope.lga_code;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

create function election.max_invites_per_day() returns integer language sql immutable as $$ select 300 $$;

-- A new single-use link. National admins invite state coordinators or LGA moderators
-- anywhere; state coordinators invite LGA moderators in their own state.
create function election.create_invite(p_actor uuid, p_role text, p_state smallint, p_lga smallint, p_note text default '')
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor election.staff := election.require_role(p_actor, array['national_admin', 'state_coordinator']);
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if p_role not in ('lga_moderator', 'state_coordinator') then
    raise exception 'unknown role' using errcode = '22023';
  end if;
  if p_role = 'state_coordinator' and v_actor.role <> 'national_admin' then
    raise exception 'only national admins can invite state coordinators' using errcode = '42501';
  end if;
  if not election.covers(p_actor, p_state, null) then
    raise exception 'that area is outside yours' using errcode = '42501';
  end if;
  if p_role = 'lga_moderator' and not exists (
    select 1 from election.lgas l where l.state_code = p_state and l.code = p_lga) then
    raise exception 'choose an LGA in that state' using errcode = '22023';
  end if;
  if (select count(*) from election.invites i
      where i.created_by = p_actor and i.created_at > now() - interval '1 day') >= election.max_invites_per_day() then
    raise exception 'too many invites today, try again tomorrow' using errcode = 'P0001';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into election.invites as i (token_hash, role, state_code, lga_code, note, created_by)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_role, p_state,
    case when p_role = 'lga_moderator' then p_lga end, coalesce(trim(p_note), ''), p_actor)
  returning i.id, i.expires_at into v_id, v_expires;

  insert into ops.audit_log (actor_id, action, target_table, target_id, details)
  values (p_actor, 'election_invite_created', 'election.invites', v_id::text,
    jsonb_build_object('role', p_role, 'state', p_state, 'lga', p_lga));
  return query select v_id, v_token, v_expires;
end;
$$;

-- What a link is for, shown on the join page before the volunteer signs up.
create function election.invite_details(p_token text)
returns table (status text, role text, state_name text, lga_name text, inviter text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when i.used_at is not null then 'used'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at < now() then 'expired'
      else 'open'
    end,
    i.role, st.name, l.name, coalesce(o.display_name, 'CivicVoice')
  from election.invites i
  join election.states st on st.code = i.state_code
  left join election.lgas l on l.state_code = i.state_code and l.code = i.lga_code
  left join ops.staff o on o.user_id = i.created_by
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Turns a new account into a moderator. Single use: the invite row is locked, so two people
-- with the same link can't both join. The web app creates the auth user first and deletes it
-- again if this fails.
create function election.redeem_invite(p_token text, p_user uuid, p_display_name text)
returns table (role text, state_code smallint, lga_code smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite election.invites;
  v_name text := trim(coalesce(p_display_name, ''));
begin
  select * into v_invite from election.invites i
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if v_invite.id is null then
    raise exception 'that invite link is not valid' using errcode = 'P0002';
  end if;
  if v_invite.used_at is not null then
    raise exception 'that invite link has already been used' using errcode = 'P0001';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'that invite link was cancelled' using errcode = 'P0001';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'that invite link has expired' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 60 then
    raise exception 'enter your name' using errcode = '22023';
  end if;
  if exists (select 1 from ops.staff o where o.user_id = p_user) then
    raise exception 'this account is already staff' using errcode = 'P0001';
  end if;
  -- An inviter who has since been deactivated can't bring people in.
  if not election.covers(v_invite.created_by, v_invite.state_code, null) then
    raise exception 'that invite link was cancelled' using errcode = 'P0001';
  end if;

  insert into ops.staff (user_id, display_name, role) values (p_user, v_name, 'election_moderator');
  insert into election.staff (user_id, role, state_code, lga_code, invited_by)
  values (p_user, v_invite.role, v_invite.state_code, v_invite.lga_code, v_invite.created_by);
  update election.invites i set used_at = now(), used_by = p_user where i.id = v_invite.id;

  insert into ops.audit_log (actor_id, action, target_table, target_id, details)
  values (p_user, 'election_invite_redeemed', 'election.invites', v_invite.id::text, '{}');
  return query select v_invite.role, v_invite.state_code, v_invite.lga_code;
end;
$$;

create function election.revoke_invite(p_actor uuid, p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite election.invites;
begin
  perform election.require_role(p_actor, array['national_admin', 'state_coordinator']);
  select * into v_invite from election.invites i where i.id = p_invite for update;
  if v_invite.id is null or not election.covers(p_actor, v_invite.state_code, null)
     or (v_invite.role = 'state_coordinator'
         and (select s.role from election.staff_scope(p_actor) s) <> 'national_admin') then
    raise exception 'no such invite' using errcode = 'P0002';
  end if;
  if v_invite.used_at is null and v_invite.revoked_at is null then
    update election.invites i set revoked_at = now() where i.id = p_invite;
    insert into ops.audit_log (actor_id, action, target_table, target_id, details)
    values (p_actor, 'election_invite_revoked', 'election.invites', p_invite::text, '{}');
  end if;
end;
$$;

-- Open (unused, unexpired, not cancelled) invites in the actor's area.
create function election.open_invites(p_actor uuid)
returns table (id uuid, role text, state_name text, lga_name text, note text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.role, st.name, l.name, i.note, i.created_at, i.expires_at
  from election.invites i
  join election.states st on st.code = i.state_code
  left join election.lgas l on l.state_code = i.state_code and l.code = i.lga_code
  where i.used_at is null and i.revoked_at is null and i.expires_at > now()
    and election.covers(p_actor, i.state_code, null)
    and (i.role = 'lga_moderator' or (select s.role from election.staff_scope(p_actor) s) = 'national_admin')
  order by i.created_at desc
  limit 500;
$$;

-- ---------------------------------------------------------------------------
-- The team
-- ---------------------------------------------------------------------------

-- Moderators and coordinators the actor manages: LGA moderators in their state (state
-- coordinators), everyone (national admins).
create function election.team(p_actor uuid)
returns table (user_id uuid, display_name text, role text, state_name text, lga_name text,
  active boolean, trained boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id, o.display_name, s.role, st.name, l.name, s.active, s.trained_at is not null, s.created_at
  from election.staff s
  join ops.staff o on o.user_id = s.user_id
  left join election.states st on st.code = s.state_code
  left join election.lgas l on l.state_code = s.state_code and l.code = s.lga_code
  cross join lateral (select sc.role as actor_role from election.staff_scope(p_actor) sc) a
  where s.user_id <> p_actor
    and (a.actor_role = 'national_admin'
         or (a.actor_role = 'state_coordinator' and s.role = 'lga_moderator'
             and election.covers(p_actor, s.state_code, null)))
  order by st.name nulls first, l.name nulls first, o.display_name
  limit 2000;
$$;

-- Deactivating takes effect on the moderator's next click: every staff page checks it.
create function election.set_staff_active(p_actor uuid, p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform election.require_role(p_actor, array['national_admin', 'state_coordinator']);
  if not exists (select 1 from election.team(p_actor) t where t.user_id = p_user) then
    raise exception 'no such moderator in your area' using errcode = 'P0002';
  end if;
  update election.staff s set active = p_active where s.user_id = p_user;
  -- Volunteers' sign-in goes with their election role. Civic staff keep their civic access.
  update ops.staff o set active = p_active where o.user_id = p_user and o.role = 'election_moderator';
  insert into ops.audit_log (actor_id, action, target_table, target_id, details)
  values (p_actor, case when p_active then 'election_staff_reactivated' else 'election_staff_deactivated' end,
    'election.staff', p_user::text, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Training
-- ---------------------------------------------------------------------------

-- The web app grades the check (the answers live there) and records a pass here.
create function election.record_training(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update election.staff s set trained_at = coalesce(s.trained_at, now()) where s.user_id = p_user and s.active;
  insert into ops.audit_log (actor_id, action, target_table, target_id, details)
  values (p_user, 'election_training_passed', 'election.staff', p_user::text, '{}');
end;
$$;

-- Fake reports at polling units in the actor's area, for practice. Each call adds a dozen,
-- a few of them corroborated by extra fake senders. Only ever in the practice election.
create function election.seed_practice(p_actor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope record;
  v_units text[];
  v_samples text[][] := array[
    ['late_opening', 'Officials arrived at 10:40, voting has not started'],
    ['materials_missing', 'No result sheets for the Senate election'],
    ['bvas_failure', 'BVAS stopped reading fingerprints, long queue waiting'],
    ['voters_turned_away', 'My name is on the register outside but they said it is not in the BVAS'],
    ['vote_buying', 'Men by the gate giving 5,000 naira to people who show their ballot'],
    ['intimidation', 'A group is telling voters from my street to go home'],
    ['violence', 'Fighting near the polling unit, people are running'],
    ['ballot_snatching', 'Some boys took the ballot box and ran towards the junction'],
    ['accessibility', 'The unit is upstairs and there is no help for an elderly woman'],
    ['result_not_posted', 'Counting finished but the EC8A was not pasted'],
    ['other', 'Photo of the queue: please check, I think the unit was moved'],
    ['all_smooth', '']
  ];
  v_count integer := 0;
  v_unit text;
  v_sample integer;
  v_extra integer;
begin
  select * into v_scope from election.staff_scope(p_actor);
  if v_scope.role is null then
    raise exception 'you do not have permission to do that' using errcode = '42501';
  end if;

  -- National admins practise on Lagos; everyone else in their own area.
  select array_agg(code order by random()) into v_units from (
    select pu.code from election.polling_units pu
    where pu.active
      and pu.state_code = coalesce(v_scope.state_code, 24)
      and (v_scope.lga_code is null or pu.lga_code = v_scope.lga_code)
    order by random() limit 8
  ) u;
  if v_units is null then
    raise exception 'there are no polling units loaded for your area yet' using errcode = 'P0002';
  end if;

  for i in 1 .. 12 loop
    v_unit := v_units[1 + (i % cardinality(v_units))];
    v_sample := 1 + ((i * 7) % 12);
    -- Every fourth one gets two more senders: corroborated.
    v_extra := case when i % 4 = 0 then 2 else 0 end;
    for k in 0 .. v_extra loop
      begin
        perform election.submit_report('practice', v_unit, v_samples[v_sample][1],
          case when k = 0 then v_samples[v_sample][2] else 'Same here' end,
          '{}', case when k = 1 then 'whatsapp' else 'web' end,
          'practice-' || encode(extensions.gen_random_bytes(12), 'hex'));
        v_count := v_count + 1;
      exception when others then
        null; -- a clash with an earlier practice report: skip it
      end;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Clears practice incidents in the actor's area, to start over.
create function election.reset_practice(p_actor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with gone as (
    delete from election.incidents i
    using election.polling_units pu
    where i.election_id = 'practice' and pu.code = i.pu_code
      and election.covers(p_actor, pu.state_code, pu.lga_code)
    returning 1
  )
  select count(*) into v_deleted from gone;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Incidents in an area (read-only here; the election-day queue in task E6 acts on them)
-- ---------------------------------------------------------------------------

create function election.incidents_in_scope(p_actor uuid, p_election text, p_limit integer default 200)
returns table (id bigint, pu_code text, pu_name text, ward_name text, lga_name text, state_name text,
  category text, category_label text, severity text, label text, sender_count integer,
  first_reported_at timestamptz, last_reported_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope record;
begin
  select * into v_scope from election.staff_scope(p_actor);
  if v_scope.role is null then
    raise exception 'you do not have permission to do that' using errcode = '42501';
  end if;
  if not v_scope.trained and not exists (
    select 1 from election.elections e where e.id = p_election and e.is_training) then
    raise exception 'finish the training check first' using errcode = '42501';
  end if;

  return query
  select i.id, i.pu_code, pu.name, w.name, l.name, st.name, c.id, c.label, c.severity, i.label,
    i.sender_count, i.first_reported_at, i.last_reported_at
  from election.incidents i
  join election.polling_units pu on pu.code = i.pu_code
  join election.wards w on w.state_code = pu.state_code and w.lga_code = pu.lga_code and w.code = pu.ward_code
  join election.lgas l on l.state_code = pu.state_code and l.code = pu.lga_code
  join election.states st on st.code = pu.state_code
  join election.categories c on c.id = i.category
  where i.election_id = p_election
    and (v_scope.role = 'national_admin'
         or (pu.state_code = v_scope.state_code and (v_scope.lga_code is null or pu.lga_code = v_scope.lga_code)))
  order by array_position(array['critical', 'high', 'medium', 'info'], c.severity), i.last_reported_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

revoke execute on all functions in schema election from public, anon, authenticated;
grant execute on all functions in schema election to service_role;
