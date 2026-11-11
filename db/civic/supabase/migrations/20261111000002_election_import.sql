-- Polling-unit import (docs/ELECTIONS.md, task E2). The importer (packages/election-data)
-- calls this once per LGA with what INEC's portal lists for it. It inserts and updates,
-- never deletes: units no longer listed are marked inactive only when asked, so existing
-- reports keep their unit.
--
-- p_lga: {"code": 1, "name": "AGEGE", "wards": [{"code": 1, "name": "...",
--          "units": [{"unit_no": 1, "name": "...", "lat": 6.6, "lng": 3.3, "inec_id": 76564}]}]}

create function election.import_lga(p_state_code smallint, p_lga jsonb, p_deactivate_missing boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lga smallint := (p_lga->>'code')::smallint;
  v_inserted integer;
  v_updated integer;
  v_total integer;
  v_deactivated integer := 0;
  v_keys text[];
begin
  if v_lga is null or coalesce(p_lga->>'name', '') = '' then
    raise exception 'each LGA needs a code and a name' using errcode = 'P0001';
  end if;

  insert into election.lgas as l (state_code, code, name)
  values (p_state_code, v_lga, p_lga->>'name')
  on conflict (state_code, code) do update set name = excluded.name
  where l.name is distinct from excluded.name;

  insert into election.wards as w (state_code, lga_code, code, name)
  select p_state_code, v_lga, (x->>'code')::smallint, x->>'name'
  from jsonb_array_elements(p_lga->'wards') x
  on conflict (state_code, lga_code, code) do update set name = excluded.name
  where w.name is distinct from excluded.name;

  -- Every unit in the listing, as "ward/unit" keys (for counting and deactivation).
  select coalesce(array_agg((w->>'code')::smallint || '/' || (u->>'unit_no')::smallint), '{}')
  into v_keys
  from jsonb_array_elements(p_lga->'wards') w, jsonb_array_elements(w->'units') u;
  v_total := cardinality(v_keys);

  -- Coordinates and INEC ids are kept when a fresh listing doesn't include them.
  with upserted as (
    insert into election.polling_units as pu (state_code, lga_code, ward_code, unit_no, name, lat, lng, inec_id)
    select p_state_code, v_lga, (w->>'code')::smallint, (u->>'unit_no')::smallint, u->>'name',
           (u->>'lat')::numeric(8, 5), (u->>'lng')::numeric(8, 5), (u->>'inec_id')::integer
    from jsonb_array_elements(p_lga->'wards') w, jsonb_array_elements(w->'units') u
    on conflict (state_code, lga_code, ward_code, unit_no) do update set
      name = excluded.name,
      lat = coalesce(excluded.lat, pu.lat),
      lng = coalesce(excluded.lng, pu.lng),
      inec_id = coalesce(excluded.inec_id, pu.inec_id),
      active = true,
      updated_at = now()
    where pu.name is distinct from excluded.name
       or (excluded.lat is not null and pu.lat is distinct from excluded.lat)
       or (excluded.lng is not null and pu.lng is distinct from excluded.lng)
       or (excluded.inec_id is not null and pu.inec_id is distinct from excluded.inec_id)
       or not pu.active
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_inserted, v_updated from upserted;

  if p_deactivate_missing then
    if v_total = 0 then
      raise exception 'refusing to deactivate every unit in an LGA: the listing is empty' using errcode = 'P0001';
    end if;
    with gone as (
      update election.polling_units pu set active = false, updated_at = now()
      where pu.state_code = p_state_code and pu.lga_code = v_lga and pu.active
        and not (pu.ward_code || '/' || pu.unit_no = any (v_keys))
      returning 1
    )
    select count(*) into v_deactivated from gone;
  end if;

  return jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_total - v_inserted - v_updated,
    'deactivated', v_deactivated);
end;
$$;

-- Units that already have coordinates, so a crawl can skip asking INEC for them again.
create function election.units_with_coordinates(p_state_code smallint)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select code from election.polling_units where state_code = p_state_code and lat is not null;
$$;

revoke execute on all functions in schema election from public, anon, authenticated;
grant execute on all functions in schema election to service_role;
