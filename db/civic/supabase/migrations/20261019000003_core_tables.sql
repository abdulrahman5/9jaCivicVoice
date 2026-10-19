-- core: issues, reports, media, status events, agencies, boundaries.
-- Enum values mirror packages/validation.

create type core.city as enum ('lagos', 'fct');
create type core.category as enum ('roads', 'electricity', 'water', 'health', 'public_service');
create type core.channel as enum ('whatsapp', 'web');
create type core.actor_type as enum ('system', 'moderator', 'agency', 'citizen');
create type core.issue_status as enum (
  'received', 'verified', 'forwarded', 'acknowledged', 'in_progress',
  'resolved', 'confirmed_fixed', 'unconfirmed', 'rejected', 'merged'
);

-- Administrative boundaries (GRID3 Nigeria), used to fill LGA and ward on insert.
create table core.lgas (
  id serial primary key,
  city core.city not null,
  name text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  unique (city, name)
);
create index on core.lgas using gist (geom);

create table core.wards (
  id serial primary key,
  lga_id integer not null references core.lgas (id) on delete cascade,
  name text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null
);
create index on core.wards using gist (geom);

-- Hand-maintained agency directory (about 15 per city at launch).
create table core.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city core.city not null,
  categories core.category[] not null default '{}',
  lgas text[] not null default '{}',
  contact_emails text[] not null default '{}',
  x_handle text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence core.ref_seq start 1000;

create table core.issues (
  id uuid primary key default gen_random_uuid(),
  ref_code text not null unique,
  city core.city not null,
  category core.category not null,
  subcategory text not null,
  title text not null,
  status core.issue_status not null default 'received',
  -- Null when the reporter typed an area instead of sharing a pin; a moderator places it.
  location extensions.geography(Point, 4326),
  location_text text check (length(location_text) <= 200),
  lga text,
  ward text,
  agency_id uuid references core.agencies (id),
  merged_into uuid references core.issues (id),
  metoo_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  confirmed_at timestamptz,
  check (location is not null or location_text is not null)
);
create index on core.issues using gist (location);
create index on core.issues (status, created_at);
create index on core.issues (city, created_at desc);
create index on core.issues (agency_id);

create table core.reports (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references core.issues (id) on delete cascade,
  channel core.channel not null,
  description text not null default '' check (length(description) <= 2000),
  since text check (since in ('today', 'this_week', 'over_a_month')),
  transcript text,
  -- Phone number, only if the reporter wants updates (always for WhatsApp, optional on the web):
  --   contact_hash       HMAC (pepper held outside the database), for lookups and "Me too"
  --   contact_encrypted  AES-256-GCM envelope (key held outside the database), to send updates
  -- Both are cleared 90 days after the issue closes (core.purge_expired).
  contact_hash text,
  contact_encrypted text,
  language text not null default 'en',
  -- SHA-256 of the secret the reporter's browser keeps to confirm the fix.
  tracking_token_hash text not null,
  triage jsonb,
  created_at timestamptz not null default now()
);
create index on core.reports (issue_id);
create index on core.reports (contact_hash) where contact_hash is not null;

create table core.media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references core.reports (id) on delete cascade,
  storage_key text not null,
  kind text not null check (kind in ('image', 'audio')),
  approved_by uuid,
  approved_at timestamptz,
  public_key text,
  created_at timestamptz not null default now()
);
create index on core.media (report_id);

create table core.status_events (
  id bigint generated always as identity primary key,
  issue_id uuid not null references core.issues (id) on delete cascade,
  from_status core.issue_status,
  to_status core.issue_status not null,
  actor_type core.actor_type not null,
  actor_id text,
  public_note text check (length(public_note) <= 1000),
  created_at timestamptz not null default now()
);
create index on core.status_events (issue_id, created_at);

create table core.metoos (
  issue_id uuid not null references core.issues (id) on delete cascade,
  supporter_hash text not null,
  created_at timestamptz not null default now(),
  primary key (issue_id, supporter_hash)
);

create or replace function core.bump_metoo_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update core.issues set metoo_count = metoo_count + 1 where id = new.issue_id;
  return new;
end;
$$;

create trigger metoos_bump_count after insert on core.metoos
for each row execute function core.bump_metoo_count();
