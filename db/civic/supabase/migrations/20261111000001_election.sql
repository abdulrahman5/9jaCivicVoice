-- Election reporting v1 (docs/ELECTIONS.md), task E1: the election schema.
--
-- Citizens report incidents at their polling unit; reports about the same unit and
-- category group into one incident, which is "reported", "corroborated" (3+ independent
-- senders within 2 hours), "verified" or "rejected". Server code calls these functions
-- with the service role; the public will read aggregates through public_read (task E7).

create schema if not exists election;
grant usage on schema election to service_role;

-- ---------------------------------------------------------------------------
-- INEC's geography: state -> LGA -> registration area (ward) -> polling unit.
-- Codes are INEC's numbers. Polling-unit codes read SS/LL/WW/PPP, e.g. 24/02/01/003.
-- ---------------------------------------------------------------------------

create table election.states (
  code smallint primary key check (code between 1 and 37),
  name text not null unique
);

create table election.lgas (
  state_code smallint not null references election.states (code),
  code smallint not null check (code between 1 and 99),
  name text not null,
  primary key (state_code, code)
);

create table election.wards (
  state_code smallint not null,
  lga_code smallint not null,
  code smallint not null check (code between 1 and 99),
  name text not null,
  primary key (state_code, lga_code, code),
  foreign key (state_code, lga_code) references election.lgas (state_code, code)
);

create table election.polling_units (
  state_code smallint not null,
  lga_code smallint not null,
  ward_code smallint not null,
  unit_no smallint not null check (unit_no between 1 and 999),
  code text generated always as (
    lpad(state_code::text, 2, '0') || '/' || lpad(lga_code::text, 2, '0') || '/' ||
    lpad(ward_code::text, 2, '0') || '/' || lpad(unit_no::text, 3, '0')
  ) stored unique,
  name text not null,
  -- Approximate, from INEC's locator; null for about 8% of units. Never used to place an incident.
  lat numeric(8, 5) check (lat between 4 and 14),
  lng numeric(8, 5) check (lng between 2.5 and 15),
  inec_id integer,
  -- Units INEC drops stay, inactive, so existing reports keep their unit.
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (state_code, lga_code, ward_code, unit_no),
  foreign key (state_code, lga_code, ward_code) references election.wards (state_code, lga_code, code)
);

-- INEC's state codes: the 36 states alphabetically, then the FCT as 37.
insert into election.states (code, name) values
  (1, 'Abia'), (2, 'Adamawa'), (3, 'Akwa Ibom'), (4, 'Anambra'), (5, 'Bauchi'), (6, 'Bayelsa'),
  (7, 'Benue'), (8, 'Borno'), (9, 'Cross River'), (10, 'Delta'), (11, 'Ebonyi'), (12, 'Edo'),
  (13, 'Ekiti'), (14, 'Enugu'), (15, 'Gombe'), (16, 'Imo'), (17, 'Jigawa'), (18, 'Kaduna'),
  (19, 'Kano'), (20, 'Katsina'), (21, 'Kebbi'), (22, 'Kogi'), (23, 'Kwara'), (24, 'Lagos'),
  (25, 'Nasarawa'), (26, 'Niger'), (27, 'Ogun'), (28, 'Ondo'), (29, 'Osun'), (30, 'Oyo'),
  (31, 'Plateau'), (32, 'Rivers'), (33, 'Sokoto'), (34, 'Taraba'), (35, 'Yobe'), (36, 'Zamfara'),
  (37, 'Federal Capital Territory');

-- Turns what people type into INEC's form: "24-2-1-3", "24/02/01/003", "24 02 01 003"
-- and "240201003" all become "24/02/01/003". Returns null for anything else.
create function election.normalize_pu_code(p_input text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[];
  v_digits text;
begin
  if p_input is null then
    return null;
  end if;
  v_parts := regexp_split_to_array(trim(p_input), '[^0-9]+');
  if array_length(v_parts, 1) = 1 then
    v_digits := v_parts[1];
    if v_digits !~ '^\d{9}$' then
      return null;
    end if;
    v_parts := array[substr(v_digits, 1, 2), substr(v_digits, 3, 2), substr(v_digits, 5, 2), substr(v_digits, 7, 3)];
  end if;
  if array_length(v_parts, 1) <> 4
     or v_parts[1] !~ '^\d{1,2}$' or v_parts[2] !~ '^\d{1,2}$'
     or v_parts[3] !~ '^\d{1,2}$' or v_parts[4] !~ '^\d{1,3}$'
     or v_parts[1]::int = 0 or v_parts[2]::int = 0 or v_parts[3]::int = 0 or v_parts[4]::int = 0 then
    return null;
  end if;
  return lpad(v_parts[1]::int::text, 2, '0') || '/' || lpad(v_parts[2]::int::text, 2, '0') || '/' ||
         lpad(v_parts[3]::int::text, 2, '0') || '/' || lpad(v_parts[4]::int::text, 3, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Elections (one row per polling day) and where each is held
-- ---------------------------------------------------------------------------

create table election.elections (
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  name text not null,
  polls_on date not null,
  -- Reports are accepted only inside this window (polling day and counting into the next day).
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  -- Practice elections for moderator training: never shown publicly.
  is_training boolean not null default false,
  check (closes_at > opens_at)
);

create table election.election_states (
  election_id text not null references election.elections (id) on delete cascade,
  state_code smallint not null references election.states (code),
  primary key (election_id, state_code)
);

-- Dates from INEC's revised timetable (Feb 2026). Windows: 06:00 WAT on polling day to
-- 23:59 WAT the next day. Admins can change them if INEC does.
insert into election.elections (id, name, polls_on, opens_at, closes_at) values
  ('2027-presidential-nass', 'Presidential and National Assembly elections', '2027-01-16',
   '2027-01-16 06:00:00+01', '2027-01-17 23:59:00+01'),
  ('2027-governorship-sha', 'Governorship and State Houses of Assembly elections', '2027-02-06',
   '2027-02-06 06:00:00+01', '2027-02-07 23:59:00+01');
-- Presidential/NASS: every state and the FCT. Governorship/State Assembly: the 36 states
-- (state assembly polls hold everywhere; the FCT has neither).
insert into election.election_states (election_id, state_code)
select '2027-presidential-nass', code from election.states;
insert into election.election_states (election_id, state_code)
select '2027-governorship-sha', code from election.states where code <> 37;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create table election.categories (
  id text primary key check (id ~ '^[a-z_]{3,40}$'),
  stage text not null check (stage in ('opening', 'accreditation', 'voting', 'counting', 'any')),
  label text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'info')),
  -- The finest level shown publicly. Violence and intimidation never go below ward.
  public_detail text not null default 'unit' check (public_detail in ('unit', 'ward')),
  sort smallint not null unique
);

insert into election.categories (id, stage, label, severity, public_detail, sort) values
  ('late_opening',          'opening',       'Polling unit opened late, or not at all',                 'high',     'unit',  10),
  ('materials_missing',     'opening',       'Election materials missing or insufficient',              'high',     'unit',  20),
  ('officials_absent',      'opening',       'INEC officials absent',                                   'high',     'unit',  30),
  ('unit_moved',            'opening',       'Polling unit moved without notice',                       'medium',   'unit',  40),
  ('bvas_failure',          'accreditation', 'BVAS not working, or accreditation stopped',              'high',     'unit',  50),
  ('voters_turned_away',    'accreditation', 'Registered voters turned away, or names missing',         'medium',   'unit',  60),
  ('vote_buying',           'voting',        'Vote buying',                                             'high',     'unit',  70),
  ('intimidation',          'voting',        'Intimidation or harassment of voters',                    'critical', 'ward',  80),
  ('violence',              'voting',        'Violence',                                                'critical', 'ward',  90),
  ('ballot_snatching',      'voting',        'Ballot box snatching or destruction',                     'critical', 'unit', 100),
  ('underage_voting',       'voting',        'Underage or unregistered voting',                         'medium',   'unit', 110),
  ('accessibility',         'voting',        'Polling unit not accessible (disability, elderly, pregnant women)', 'medium', 'unit', 120),
  ('security_interference', 'voting',        'Security agents interfering',                             'high',     'unit', 130),
  ('early_closure',         'voting',        'Voting closed early',                                     'high',     'unit', 140),
  ('counting_disrupted',    'counting',      'Counting disrupted or done away from the polling unit',  'critical', 'unit', 150),
  ('result_sheet_tampered', 'counting',      'Pre-filled or tampered result sheet seen',                'critical', 'unit', 160),
  ('result_not_posted',     'counting',      'Result sheet (EC8A) not posted at the polling unit',      'high',     'unit', 170),
  ('other',                 'any',           'Other',                                                   'medium',   'unit', 180),
  ('all_smooth',            'any',           'All went smoothly',                                       'info',     'unit', 190);

-- ---------------------------------------------------------------------------
-- Incidents (grouped reports) and reports
-- ---------------------------------------------------------------------------

create table election.incidents (
  id bigint generated always as identity primary key,
  election_id text not null references election.elections (id),
  pu_code text not null references election.polling_units (code),
  category text not null references election.categories (id),
  label text not null default 'reported' check (label in ('reported', 'corroborated', 'verified', 'rejected')),
  -- Distinct senders, so one person reporting twice counts once.
  sender_count integer not null default 0,
  first_reported_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  reject_reason text check (length(reject_reason) between 1 and 300),
  unique (election_id, pu_code, category)
);
create index on election.incidents (election_id, label);
create index on election.incidents (election_id, last_reported_at desc);

create table election.reports (
  id uuid primary key default gen_random_uuid(),
  ref_code text not null unique check (ref_code ~ '^EV-[2-9A-HJ-NP-Z]{7}$'),
  incident_id bigint not null references election.incidents (id) on delete cascade,
  election_id text not null references election.elections (id),
  pu_code text not null references election.polling_units (code),
  category text not null references election.categories (id),
  description text not null default '' check (length(description) <= 1000),
  media_keys text[] not null default '{}' check (cardinality(media_keys) <= 3),
  channel text not null check (channel in ('web', 'whatsapp')),
  -- HMAC of the phone number (WhatsApp) or device id (web), made by the server. Used for
  -- duplicates and rate limits; never shown.
  sender_hash text not null check (length(sender_hash) between 16 and 128),
  -- Optional, for WhatsApp follow-up replies: same scheme as core.reports (hash + encryption).
  contact_hash text,
  contact_enc text,
  created_at timestamptz not null default now(),
  unique (election_id, pu_code, category, sender_hash)
);
create index on election.reports (incident_id);
create index on election.reports (sender_hash, created_at desc);
create index on election.reports (election_id, created_at desc);

alter table election.states enable row level security;
alter table election.lgas enable row level security;
alter table election.wards enable row level security;
alter table election.polling_units enable row level security;
alter table election.elections enable row level security;
alter table election.election_states enable row level security;
alter table election.categories enable row level security;
alter table election.incidents enable row level security;
alter table election.reports enable row level security;
grant all on all tables in schema election to service_role;
grant all on all sequences in schema election to service_role;

-- ---------------------------------------------------------------------------
-- Submitting a report
-- ---------------------------------------------------------------------------

-- Short reference for a report, without look-alike characters (no 0/O, 1/I/L).
create function election.new_ref()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'EV-' || string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (get_byte(b, i) % 31), 1), '' order by i)
  from (select extensions.gen_random_bytes(7) as b) r, generate_series(0, 6) i;
$$;

-- Hourly cap per sender, against flooding.
create function election.max_reports_per_hour() returns integer language sql immutable as $$ select 10 $$;

create function election.submit_report(
  p_election_id text,
  p_pu_code text,
  p_category text,
  p_description text,
  p_media_keys text[],
  p_channel text,
  p_sender_hash text,
  p_contact_hash text default null,
  p_contact_enc text default null
)
returns table (ref_code text, label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_election election.elections;
  v_code text := election.normalize_pu_code(p_pu_code);
  v_state smallint;
  v_incident bigint;
  v_ref text;
  v_senders integer;
  v_recent integer;
  v_label text;
begin
  select * into v_election from election.elections e where e.id = p_election_id;
  if v_election.id is null then
    raise exception 'unknown election' using errcode = 'P0002';
  end if;
  if now() < v_election.opens_at or now() > v_election.closes_at then
    raise exception 'reporting is not open for this election' using errcode = 'P0001';
  end if;
  if v_code is null then
    raise exception 'that is not a polling unit code' using errcode = 'P0001';
  end if;
  select pu.state_code into v_state from election.polling_units pu where pu.code = v_code and pu.active;
  if v_state is null then
    raise exception 'no polling unit with that code' using errcode = 'P0002';
  end if;
  if not exists (select 1 from election.election_states es where es.election_id = p_election_id and es.state_code = v_state) then
    raise exception 'this election is not held in that state' using errcode = 'P0001';
  end if;
  if not exists (select 1 from election.categories c where c.id = p_category) then
    raise exception 'unknown category' using errcode = 'P0001';
  end if;
  if (select count(*) from election.reports r
      where r.sender_hash = p_sender_hash and r.created_at > now() - interval '1 hour') >= election.max_reports_per_hour() then
    raise exception 'too many reports, please wait a while' using errcode = 'P0001';
  end if;
  if exists (select 1 from election.reports r
             where r.election_id = p_election_id and r.pu_code = v_code and r.category = p_category
               and r.sender_hash = p_sender_hash) then
    raise exception 'you have already reported this at this polling unit' using errcode = 'P0001';
  end if;

  insert into election.incidents as i (election_id, pu_code, category)
  values (p_election_id, v_code, p_category)
  on conflict (election_id, pu_code, category) do update set last_reported_at = now()
  returning i.id into v_incident;
  -- Serialise reports on the same incident so the counts below are right.
  perform 1 from election.incidents i where i.id = v_incident for update;

  loop
    v_ref := election.new_ref();
    begin
      insert into election.reports (ref_code, incident_id, election_id, pu_code, category, description,
        media_keys, channel, sender_hash, contact_hash, contact_enc)
      values (v_ref, v_incident, p_election_id, v_code, p_category, coalesce(trim(p_description), ''),
        coalesce(p_media_keys, '{}'), p_channel, p_sender_hash, p_contact_hash, p_contact_enc);
      exit;
    exception when unique_violation then
      -- A clash on the reference: try another. A duplicate report was refused above.
      if not exists (select 1 from election.reports r where r.ref_code = v_ref) then
        raise;
      end if;
    end;
  end loop;

  select count(distinct r.sender_hash),
         count(distinct r.sender_hash) filter (where r.created_at > now() - interval '2 hours')
  into v_senders, v_recent
  from election.reports r where r.incident_id = v_incident;

  update election.incidents i set
    sender_count = v_senders,
    label = case when i.label = 'reported' and v_recent >= 3 then 'corroborated' else i.label end
  where i.id = v_incident
  returning i.label into v_label;

  return query select v_ref, v_label;
end;
$$;

revoke execute on all functions in schema election from public, anon, authenticated;
grant execute on all functions in schema election to service_role;
