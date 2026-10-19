-- Moderation actions (PRD F6). Each runs in one transaction, re-checks the
-- issue's state, and leaves an audit trail. Called only by the web app's
-- server actions, with the signed-in moderator's id.

-- Edit category, sub-category and location before verifying. Placing a pin
-- refills LGA and ward from the boundary tables.
create or replace function core.moderate_update(
  p_issue_id uuid,
  p_moderator_id uuid,
  p_category core.category default null,
  p_subcategory text default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue core.issues;
  v_point extensions.geometry;
begin
  select * into v_issue from core.issues where id = p_issue_id for update;
  if v_issue.id is null then
    raise exception 'issue % not found', p_issue_id using errcode = 'P0002';
  end if;
  if v_issue.status not in ('received', 'verified') then
    raise exception 'issue is %, it can no longer be edited', v_issue.status using errcode = 'P0001';
  end if;

  if p_lat is not null and p_lng is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);
  end if;

  update core.issues set
    category = coalesce(p_category, category),
    subcategory = coalesce(p_subcategory, subcategory),
    title = core.title_for(coalesce(p_category, category), coalesce(p_subcategory, subcategory)),
    location = coalesce(v_point::extensions.geography, location),
    lga = case when v_point is null then lga
               else (select l.name from core.lgas l where extensions.st_contains(l.geom, v_point) limit 1) end,
    ward = case when v_point is null then ward
                else (select w.name from core.wards w where extensions.st_contains(w.geom, v_point) limit 1) end,
    updated_at = now()
  where id = p_issue_id;

  insert into ops.audit_log (actor_id, action, target_table, target_id, details)
  values (p_moderator_id, 'issue:edit', 'core.issues', p_issue_id::text, jsonb_strip_nulls(jsonb_build_object(
    'from', jsonb_build_object('category', v_issue.category, 'subcategory', v_issue.subcategory),
    'category', p_category, 'subcategory', p_subcategory,
    'located', v_point is not null)));
end;
$$;

-- Verify (if still "received") and forward to an agency in the issue's city.
create or replace function core.route_issue(p_issue_id uuid, p_agency_id uuid, p_moderator_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue core.issues;
  v_agency core.agencies;
begin
  select * into v_issue from core.issues where id = p_issue_id for update;
  if v_issue.id is null then
    raise exception 'issue % not found', p_issue_id using errcode = 'P0002';
  end if;
  select * into v_agency from core.agencies where id = p_agency_id;
  if v_agency.id is null or not v_agency.active then
    raise exception 'agency not found or inactive' using errcode = 'P0002';
  end if;
  if v_agency.city <> v_issue.city then
    raise exception 'agency is in %, issue is in %', v_agency.city, v_issue.city using errcode = 'P0001';
  end if;
  if v_issue.location is null then
    raise exception 'place the issue on the map before routing it' using errcode = 'P0001';
  end if;

  if v_issue.status = 'received' then
    perform core.change_status(p_issue_id, 'verified', 'moderator', p_moderator_id::text);
  end if;
  update core.issues set agency_id = p_agency_id where id = p_issue_id;
  perform core.change_status(p_issue_id, 'forwarded', 'moderator', p_moderator_id::text,
    'Forwarded to ' || v_agency.name);
end;
$$;

-- Reject with a reason the reporter sees (spam, off-topic, not in the pilot area...).
create or replace function core.reject_issue(p_issue_id uuid, p_moderator_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'a reason is required' using errcode = 'P0001';
  end if;
  perform core.change_status(p_issue_id, 'rejected', 'moderator', p_moderator_id::text, trim(p_reason));
end;
$$;

-- Merge a duplicate into an open issue: its reports move to the target (so
-- those reporters get the target's updates) and count as "Me too"s.
create or replace function core.merge_issue(p_issue_id uuid, p_into_id uuid, p_moderator_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target core.issues;
  v_moved integer;
begin
  if p_issue_id = p_into_id then
    raise exception 'an issue cannot be merged into itself' using errcode = 'P0001';
  end if;
  -- Lock both rows in a fixed order to avoid deadlocks between concurrent merges.
  perform 1 from core.issues where id in (p_issue_id, p_into_id) order by id for update;
  select * into v_target from core.issues where id = p_into_id;
  if v_target.id is null or v_target.status in ('rejected', 'merged') then
    raise exception 'target issue is not open' using errcode = 'P0001';
  end if;

  perform core.change_status(p_issue_id, 'merged', 'moderator', p_moderator_id::text,
    'Merged with ' || v_target.ref_code || ', a report of the same problem');

  update core.reports set issue_id = p_into_id where issue_id = p_issue_id;
  get diagnostics v_moved = row_count;
  update core.issues set merged_into = p_into_id where id = p_issue_id;
  update core.issues set metoo_count = metoo_count + v_moved, updated_at = now() where id = p_into_id;
end;
$$;

revoke execute on function core.moderate_update, core.route_issue, core.reject_issue, core.merge_issue
  from public, anon, authenticated;
grant execute on function core.moderate_update, core.route_issue, core.reject_issue, core.merge_issue
  to service_role;
