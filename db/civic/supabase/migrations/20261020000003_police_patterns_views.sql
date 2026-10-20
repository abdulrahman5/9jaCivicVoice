-- Views for the public police patterns page (/police, docs/POLICE.md section 5).
-- They only add place context to what the bridge already published: no new data about reports.

-- Each published ~1 km cell with its centre and the LGA that contains it. Cells are
-- "row:col" at 0.01 degrees (apps/police-intake/src/privacy.ts).
create view public_read.police_areas as
with cells as (
  select p.*,
    (split_part(p.grid_cell, ':', 1)::integer + 0.5) * 0.01 as lat,
    (split_part(p.grid_cell, ':', 2)::integer + 0.5) * 0.01 as lng
  from public_read.police_patterns p
)
select c.period_start, c.city, c.grid_cell, c.kind, c.incident_type, c.band,
  round(c.lat::numeric, 3) as lat, round(c.lng::numeric, 3) as lng,
  (select l.name from core.lgas l
   where l.city = c.city
     and extensions.st_contains(l.geom, extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326))
   limit 1) as lga
from cells c;

-- LGA outlines for the patterns map, simplified, as SVG path data (y is negated latitude).
create view public_read.lga_outlines as
select l.city, l.name,
  extensions.st_assvg(extensions.st_simplifypreservetopology(l.geom, 0.0005), 0, 4) as svg_path,
  round(extensions.st_xmin(l.geom)::numeric, 4) as min_lng,
  round(extensions.st_ymin(l.geom)::numeric, 4) as min_lat,
  round(extensions.st_xmax(l.geom)::numeric, 4) as max_lng,
  round(extensions.st_ymax(l.geom)::numeric, 4) as max_lat,
  round(extensions.st_x(extensions.st_pointonsurface(l.geom))::numeric, 4) as label_lng,
  round(extensions.st_y(extensions.st_pointonsurface(l.geom))::numeric, 4) as label_lat
from core.lgas l;

grant select on public_read.police_areas, public_read.lga_outlines to anon, authenticated;
grant all on public_read.police_areas, public_read.lga_outlines to service_role;
