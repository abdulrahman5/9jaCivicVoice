-- Local development seed. FAKE data only: rough boxes, not real boundaries.
-- Real LGA and ward boundaries come from GRID3 Nigeria (see README).

insert into core.lgas (city, name, geom) values
  ('lagos', 'Ikeja', extensions.st_multi(extensions.st_makeenvelope(3.30, 6.57, 3.38, 6.64, 4326))),
  ('fct', 'Bwari', extensions.st_multi(extensions.st_makeenvelope(7.30, 9.10, 7.45, 9.30, 4326)));

insert into core.wards (lga_id, name, geom)
select id, 'Ward 04 (sample)', extensions.st_multi(extensions.st_makeenvelope(3.33, 6.59, 3.36, 6.62, 4326))
from core.lgas where name = 'Ikeja';

insert into core.agencies (name, city, categories, contact_emails) values
  ('[Sample] Electricity DisCo, Ikeja unit', 'lagos', '{electricity}', '{disco@example.org}'),
  ('[Sample] State Ministry of Works', 'lagos', '{roads}', '{works@example.org}'),
  ('[Sample] FCT Water Board', 'fct', '{water}', '{water@example.org}');
