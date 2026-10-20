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

  -- Police patterns as the bridge would publish them (FAKE; previews have no police vault).
  -- The last three completed months, cells inside the sample LGA boxes from seed.sql.
  for i in 1..3 loop
    insert into public_read.police_periods (period_start)
    values ((date_trunc('month', now() at time zone 'Africa/Lagos') - make_interval(months => i))::date);
  end loop;
  insert into public_read.police_patterns (period_start, city, grid_cell, kind, incident_type, band)
  select (date_trunc('month', now() at time zone 'Africa/Lagos') - make_interval(months => v.ago))::date,
    v.city::core.city, v.cell, v.kind, v.type, v.band
  from (values
    (1, 'lagos', '659:334', 'misconduct', 'money_demanded', '11-25'),
    (1, 'lagos', '659:334', 'misconduct', 'phone_searched_harassment', '3-5'),
    (1, 'lagos', '660:335', 'misconduct', 'money_demanded', '6-10'),
    (1, 'lagos', '661:333', 'misconduct', 'unlawful_arrest_detention', '3-5'),
    (1, 'lagos', '658:336', 'commendation', 'helped_me', '3-5'),
    (1, 'lagos', '662:331', 'misconduct', 'money_demanded', '26+'),
    (2, 'lagos', '659:334', 'misconduct', 'money_demanded', '6-10'),
    (2, 'lagos', '662:331', 'misconduct', 'money_demanded', '11-25'),
    (3, 'lagos', '662:331', 'misconduct', 'money_demanded', '6-10'),
    (1, 'fct', '915:735', 'misconduct', 'money_demanded', '6-10'),
    (1, 'fct', '920:740', 'commendation', 'refused_bribe', '3-5'),
    (2, 'fct', '915:735', 'misconduct', 'money_demanded', '3-5')
  ) v(ago, city, cell, kind, type, band);
  insert into public_read.police_forwarding (period_start, city, recipient, forwarded, acknowledged, action_reported, no_response)
  select (date_trunc('month', now() at time zone 'Africa/Lagos') - make_interval(months => v.ago))::date,
    v.city::core.city, v.recipient, v.f, v.a, v.ar, v.nr
  from (values
    (1, 'lagos', 'cru', 14, 3, 1, 0), (2, 'lagos', 'cru', 11, 2, 0, 6), (3, 'lagos', 'cru', 8, 1, 1, 6),
    (1, 'lagos', 'psc', 14, 1, 0, 0), (2, 'lagos', 'psc', 11, 0, 0, 9), (3, 'lagos', 'psc', 8, 1, 0, 7),
    (1, 'fct', 'cru', 4, 1, 0, 0), (2, 'fct', 'cru', 3, 0, 0, 3), (1, 'fct', 'psc', 4, 0, 0, 0)
  ) v(ago, city, recipient, f, a, ar, nr);
end $$;

refresh materialized view public_read.scorecard;
