-- Demo data for preview deployments and screenshots. FAKE: invented reports,
-- sample agencies (from seed.sql) and rough boundaries. Never load into production.
-- Runs only on an empty database (the preview workflow checks first).
do $$
declare
  m uuid := '00000000-0000-0000-0000-0000000000aa';
  disco uuid := (select id from core.agencies where name like '%DisCo%');
  works uuid := (select id from core.agencies where name like '%Works%');
  water uuid := (select id from core.agencies where name like '%Water%');
  i int;
  r record;
  descs text[] := array[
    'No light for 5 days since the storm. Transformer is sparking.',
    'Estimated bill of N48,000 even though we have a prepaid meter.',
    'Low voltage every evening, fridge cannot work.',
    'Fallen pole across the road near the school.',
    'Whole estate in darkness since Friday.',
    'Power comes for 2 hours a day only.'];
  rdescs text[] := array[
    'Huge pothole at the junction, cars swerving into traffic.',
    'Drainage blocked, street floods every time it rains.',
    'Streetlights off for months, area is unsafe at night.',
    'Road surface completely washed away near the market.'];
begin
  if exists (select 1 from core.issues) then
    raise notice 'core.issues is not empty: demo data not loaded';
    return;
  end if;
  if disco is null or works is null or water is null then
    raise exception 'sample agencies missing: load seed.sql first';
  end if;

  -- Electricity, Ikeja: 12 routed to the DisCo, most acknowledged, some fixed
  for i in 1..12 loop
    select * into r from core.submit_report('lagos', 'electricity',
      (array['outage','estimated_billing','outage','fallen_pole','outage','outage'])[1 + i % 6],
      6.58 + (i % 5) * 0.008, 3.31 + (i % 4) * 0.012, null, descs[1 + i % 6],
      (array['today','this_week','over_a_month'])[1 + i % 3], '{}', null, null, 'en', 'web');
    perform core.route_issue(r.issue_id, disco, m);
    if i <= 9 then
      perform core.change_status(r.issue_id, 'acknowledged', 'agency', disco::text,
        (array['Fault logged, crew scheduled this week.','Billing team reviewing your account.','Engineers will inspect the transformer on Monday.'])[1 + i % 3]);
    end if;
    if i <= 5 then
      perform core.change_status(r.issue_id, 'resolved', 'agency', disco::text, 'Repair completed.');
    end if;
    if i <= 3 then
      perform core.change_status(r.issue_id, 'confirmed_fixed', 'citizen');
    end if;
    update core.issues set metoo_count = (i * 37) % 120 + 3 where id = r.issue_id;
  end loop;

  -- Roads, Ikeja: 10 routed to the Ministry of Works, few responses
  for i in 1..10 loop
    select * into r from core.submit_report('lagos', 'roads',
      (array['pothole','drainage','streetlight','pothole'])[1 + i % 4],
      6.585 + (i % 4) * 0.01, 3.315 + (i % 5) * 0.01, null, rdescs[1 + i % 4],
      'over_a_month', '{}', null, null, 'en', (array['web','whatsapp'])[1 + i % 2]::core.channel);
    perform core.route_issue(r.issue_id, works, m);
    if i <= 2 then
      perform core.change_status(r.issue_id, 'acknowledged', 'agency', works::text, 'Added to the maintenance list.');
    end if;
    update core.issues set metoo_count = (i * 23) % 90 + 1 where id = r.issue_id;
  end loop;

  -- Water, Bwari (FCT): 3 routed
  for i in 1..3 loop
    select * into r from core.submit_report('fct', 'water', 'broken_borehole',
      9.15 + i * 0.01, 7.35 + i * 0.01, null, 'Community borehole broken for three weeks.',
      'over_a_month', '{}', null, null, 'en', 'whatsapp');
    perform core.route_issue(r.issue_id, water, m);
  end loop;

  -- Waiting for moderation
  perform core.submit_report('lagos', 'electricity', 'outage', 6.6003, 3.3452, null,
    'Transformer blew last night, whole street dark.', 'today', '{}', 'demo-hash', null, 'en', 'web');
  perform core.submit_report('lagos', 'electricity', 'outage', 6.6006, 3.3449, null,
    'No light on our street since yesterday evening.', 'today', '{}', null, null, 'pcm', 'whatsapp');
  perform core.submit_report('lagos', 'water', 'other', null, null, 'Opposite Ikeja City Mall, Obafemi Awolowo Way',
    'Burst pipe flooding the road for 2 days.', 'this_week', '{}', 'demo-hash-2', null, 'en', 'whatsapp');
  perform core.submit_report('lagos', 'roads', 'pothole', 6.612, 3.338, null,
    'buy cheap phones at my shop!!! call 0803...', null, '{}', null, null, 'en', 'web');
end $$;

refresh materialized view public_read.scorecard;
