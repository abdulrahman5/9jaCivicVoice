-- Polling-unit lookup (docs/ELECTIONS.md, task E3): by code however it's typed, by
-- state -> LGA -> ward menus, by name, and "near me". Read by the server with the
-- service role; the web app's /api/election/units serves it publicly.

create extension if not exists pg_trgm with schema extensions;

-- Approximate point for "near me" and "are you near the unit you picked?". Never used to place an incident.
alter table election.polling_units add column location extensions.geography(Point, 4326)
  generated always as (
    case when lat is not null and lng is not null
      then extensions.st_setsrid(extensions.st_makepoint(lng::double precision, lat::double precision), 4326)::extensions.geography
    end
  ) stored;
create index polling_units_location on election.polling_units using gist (location);
create index polling_units_name_trgm on election.polling_units using gin (lower(name) extensions.gin_trgm_ops);

-- Each unit with the names of its ward, LGA and state.
create view election.unit_directory as
select pu.code, pu.name, pu.active, pu.location,
  pu.state_code, s.name as state_name,
  pu.lga_code, l.name as lga_name,
  pu.ward_code, w.name as ward_name
from election.polling_units pu
join election.states s on s.code = pu.state_code
join election.lgas l on l.state_code = pu.state_code and l.code = pu.lga_code
join election.wards w on w.state_code = pu.state_code and w.lga_code = pu.lga_code and w.code = pu.ward_code;

-- One unit by code, typed any common way ("24-1-1-1", "240101001", ...). Inactive units are returned too,
-- marked, so a voter whose unit was moved hears that rather than "not found".
create function election.find_unit(p_code text)
returns table (code text, name text, active boolean, state_code smallint, state_name text,
  lga_code smallint, lga_name text, ward_code smallint, ward_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.code, d.name, d.active, d.state_code, d.state_name, d.lga_code, d.lga_name, d.ward_code, d.ward_name
  from election.unit_directory d
  where d.code = election.normalize_pu_code(p_code);
$$;

-- Active units in a state (and optionally an LGA) whose names contain the query, closest
-- matches first. Only when none contain it, and the query has 4+ letters, does it fall back
-- to similar spellings. A state is required: searching all 177,000 units for common words
-- like "primary school" is too slow, and people pick their state first anyway.
create function election.search_units(p_query text, p_state smallint, p_lga smallint default null, p_limit integer default 20)
returns table (code text, name text, active boolean, state_code smallint, state_name text,
  lga_code smallint, lga_name text, ward_code smallint, ward_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text text := lower(trim(coalesce(p_query, '')));
  v_pattern text := '%' || replace(replace(replace(lower(trim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if length(v_text) < 3 or p_state is null then
    return;
  end if;

  return query
    select d.code, d.name, d.active, d.state_code, d.state_name, d.lga_code, d.lga_name, d.ward_code, d.ward_name
    from election.unit_directory d
    where d.active and d.state_code = p_state and (p_lga is null or d.lga_code = p_lga)
      and lower(d.name) like v_pattern
    order by strpos(lower(d.name), v_text), length(d.name), d.code
    limit v_limit;
  if found or length(regexp_replace(v_text, '[^a-z]', '', 'g')) < 4 then
    return;
  end if;

  return query
    select d.code, d.name, d.active, d.state_code, d.state_name, d.lga_code, d.lga_name, d.ward_code, d.ward_name
    from election.unit_directory d
    where d.active and d.state_code = p_state and (p_lga is null or d.lga_code = p_lga)
      -- 0.5 rather than pg_trgm's default 0.6, so misspelled phrases ("st josef secondery") still
      -- match. Compared directly (Supabase doesn't allow changing the threshold setting), over
      -- one state's units, which the primary key narrows to first.
      and extensions.word_similarity(v_text, lower(d.name)) >= 0.5
    order by extensions.word_similarity(v_text, lower(d.name)) desc, d.code
    limit v_limit;
end;
$$;

-- The nearest active units with a known point, within p_within_m metres.
create function election.units_near(p_lat double precision, p_lng double precision, p_limit integer default 5, p_within_m integer default 3000)
returns table (code text, name text, active boolean, state_code smallint, state_name text,
  lga_code smallint, lga_name text, ward_code smallint, ward_name text, distance_m integer)
language sql
stable
security definer
set search_path = ''
as $$
  -- Nearest first on the base table, where the spatial index can order by distance; names are
  -- joined afterwards for just those few rows.
  with here as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as point
  ), nearest as (
    select pu.code, round(extensions.st_distance(pu.location, here.point))::integer as distance_m
    from election.polling_units pu, here
    where pu.active and pu.location is not null
      and extensions.st_dwithin(pu.location, here.point, least(greatest(p_within_m, 100), 20000))
    order by pu.location operator(extensions.<->) here.point
    limit least(greatest(p_limit, 1), 20)
  )
  select d.code, d.name, d.active, d.state_code, d.state_name, d.lga_code, d.lga_name, d.ward_code, d.ward_name, n.distance_m
  from nearest n join election.unit_directory d on d.code = n.code
  order by n.distance_m, d.code;
$$;

grant select on election.unit_directory to service_role;
revoke execute on all functions in schema election from public, anon, authenticated;
grant execute on all functions in schema election to service_role;
