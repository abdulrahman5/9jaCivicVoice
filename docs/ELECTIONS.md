# Election reporting: v1 spec

Citizens report what happens at their polling unit on election day. Reports roll up from **polling unit → ward → LGA → state** into a public live situation view, and feed partners such as citizen observation groups.

## Decisions (11 Nov 2026)

| Question | Decision |
| --- | --- |
| Which election | The **general election**: all 36 states and the FCT. |
| What citizens report | **Incidents and process only.** No vote counts, no results tallies. Only INEC declares results. |
| Moderation | **Every state and the FCT**, ideally a few moderators per LGA (roughly 2,000 or more people). |
| Partners | Planned: citizen observation groups and others. v1 makes verified data exportable to them. |

**Polling days** (INEC's revised timetable of 26–27 Feb 2026, as reported; confirm on INEC's site):
- **Saturday 16 January 2027:** presidential and National Assembly
- **Saturday 6 February 2027:** governorship and state Houses of Assembly

INEC has publicly ruled out postponement. The law is now the **Electoral Act 2026**, signed 18 Feb 2026, which repealed the 2022 Act.

## Principles

- **Neutral.** We report process and incidents, never who's winning. Party or candidate names appear only as a reporter alleged them, and only after moderation.
- **Ballot secrecy.** The form tells people never to photograph a marked ballot or anyone in the voting cubicle (INEC bars phones there). Photos are for queues, materials, damage and posted result sheets.
- **Reporter safety.** Reports are anonymous by default; a phone number is optional and only for WhatsApp replies. Faces in photos are blurred on the phone, using the police photo pipeline.
- **Fast but labelled.** Election reporting is only useful live, so counts publish within minutes. Every figure says how sure we are: reported, corroborated, or verified by a moderator.
- **No pinpointing danger.** Violence and intimidation never show below ward level in public, so a report can't steer people to, or expose, a specific polling unit.

## Geography

INEC's hierarchy is **state → LGA → registration area (ward) → polling unit**, with polling-unit codes in the form `SS-LL-WW-PPP` (state, LGA, ward, unit).

- **Scale:** about 176,846 polling units, 8,809 wards and 774 LGAs. Never hard-code the count: in Nov 2026, INEC was reported to have added 453 units (giving 177,299) after new constituencies were created in Kogi, Benue and Delta. The final certified register is due 15 Dec 2026.
- **Storage:** reference tables in a new `election` schema, keyed by INEC code. These are separate from `core.lgas`, which holds map boundaries for the civic pilot.
- **Elections:** each polling day is an `election` row, so reports, queues and the public view are per day.

**Data source:** see "Polling unit data" below.

## Report categories

Grouped by stage of the day, each with a severity that drives the moderation queue.

| Stage | Category | Severity |
| --- | --- | --- |
| Opening | Polling unit opened late, or not at all | high |
| Opening | Election materials missing or insufficient | high |
| Opening | INEC officials absent | high |
| Accreditation | BVAS not working, or accreditation stopped | high |
| Accreditation | Registered voters turned away, or names missing | medium |
| Voting | Vote buying | high |
| Voting | Intimidation or harassment of voters | critical |
| Voting | Violence | critical |
| Voting | Ballot box snatching or destruction | critical |
| Voting | Underage or unregistered voting | medium |
| Voting | Polling unit not accessible (disability, elderly, pregnant women) | medium |
| Voting | Security agents interfering | high |
| Opening | Polling unit moved without notice | medium |
| Voting | Voting closed early | high |
| Counting | Counting disrupted or done away from the polling unit | critical |
| Counting | Pre-filled or tampered result sheet seen | critical |
| Counting | Result sheet (EC8A) not posted at the polling unit | high |
| Any | Other | medium |
| Any | **All went smoothly** (a positive report, like Wins) | info |

Cross-checked against the categories Yiaga Africa (Watching The Vote) and CDD's Election Analysis Centre used in their 2023 and 2026 statements. Neither publishes a formal taxonomy, so matching their wording makes data easier to share. "Results not uploaded to IReV" is left out: a voter at the polling unit can't see it.

## How people report

**WhatsApp (main channel).** An election flow in the existing bot:
1. Choose the polling unit by typing its code (on the voter's card and INEC slips), or by state → LGA → ward → unit menus.
2. Choose a category.
3. Optionally add a short description and a photo.
4. Get a reference to check later.

Short replies throughout, because election day means weak data and long queues.

**Photos only on the web.** WhatsApp takes text reports. Photos sent on WhatsApp would reach our server unblurred, and faces must be blurred on the phone, so the bot points people to the web form for photos.

**Web.** The same steps on the mobile site, plus "find my polling unit" search by name, and an optional location check that only says whether you're near the unit you picked.

**Limits against flooding:**
- Turnstile on the web
- per-number and per-device limits on WhatsApp
- one report per category per polling unit per sender

Repeat reports from the same source count once.

## Verification and publication

Reports from **different** senders about the same polling unit and category are grouped into one incident.

| Label | Meaning | Public at |
| --- | --- | --- |
| Reported | One report, not yet checked | state and LGA counts only |
| Corroborated | 3 or more independent senders, same unit and category, within 2 hours | counts, plus ward detail |
| Verified | A moderator checked it (photo, consistency, follow-up) | polling unit detail, except violence and intimidation (ward level only) |
| Rejected | Spam, off-topic, partisan campaigning, or not credible | nowhere |

The public view is live:
- counts by state and LGA, by category and label
- a ward drill-down
- a timeline through the day
- an "all went smoothly" share for balance

Its method box explains the labels.

## Moderation at national scale

A few moderators per LGA means **thousands of volunteers**, so moderation needs its own structure.

**Roles, scoped by geography:**

| Role | Sees and acts on |
| --- | --- |
| LGA moderator | Their LGA's queue |
| State coordinator | Their state's queues; reassigns work; first escalation for critical incidents; invites LGA moderators |
| National admin | Everything; invites state coordinators; partner exports |

**Onboarding without the staff script:**
- a coordinator creates a single-use invite link scoped to an LGA
- the volunteer signs up, sets up two-factor, and completes a short training check
- coordinators can deactivate moderators instantly

**The election-day queue:**
- severity first (critical at the top)
- grouped by polling unit
- one-click verify or reject, plus bulk actions for duplicates
- a request-a-photo or follow-up reply for WhatsApp reporters

**Escalation:** critical incidents alert the state coordinator, and can be forwarded to partners' rapid-response lines.

**Practice:** a training mode with fake reports, so moderators practise before the day.

## Partners

- A CSV export and a read-only API of verified, anonymised incidents (no contact details, no photos with faces).
- Partner accounts that can download for their states.
- Forwarding of critical incidents comes after v1, once partners and channels are agreed.

## Capacity

2023 had about 93 million registered voters and about 25 million votes cast. If 0.5% of voters report, that's around 125,000 reports in a day, with peaks of perhaps 20,000 an hour around opening and counting.

- **WhatsApp:** messages are already queued (pgmq) and processed by the job runner, so bursts queue up rather than fail.
- **Web:** submissions go straight to Supabase. We load-test at 50 reports a second sustained, with headroom.
- **Public counts:** precomputed every minute, and pages are cached at the CDN for 60 seconds, so traffic spikes don't hit the database.
- **Upgrades:** the Supabase plan and compute are raised for election week, then lowered.

## Polling unit data

**INEC publishes no bulk file of the current polling units.** What exists (researched 11 Nov 2026, mostly from search summaries; INEC's own site couldn't be fetched from the build environment):

| Source | What it has | Caveats |
| --- | --- | --- |
| INEC's CVR polling-unit locator (cvr.inecnigeria.org) | The live hierarchy (state, LGA, ward, unit), with an approximate map point per unit | No bulk download or published terms; reached through undocumented endpoints |
| [kcemenike/find-my-polling-unit](https://github.com/kcemenike/find-my-polling-unit) | JSON scraped from the CVR locator, Oct 2026: 37 states, 774 LGAs, 8,810 wards, 176,846 units, with INEC ids and codes; coordinates for 163,171 units (about 92%); includes the scraper | No licence; ~17,400 units share a point with another; **the README is partisan**, so it's a convenience copy, never cited as a source |
| [Emeka-Onwuepe/Polling_Units_in_Nigeria](https://github.com/Emeka-Onwuepe/Polling_Units_in_Nigeria) | CSV scraped from IReV, Nov 2023: 176,846 units with codes, plus senatorial district and federal constituency | No coordinates or licence; typos in constituency names; predates the 2026 constituency changes |
| INEC PDFs | 2015 per-state directories (old 119,973 units); 2021 counts by state | Out of date; counts only |
| CredibleVoteNG | Reported free API of all units, launched in 2026 | URL, coverage and licence not yet confirmed |

**Import tool:** `packages/election-data`, run by the **Election polling units** workflow (Actions tab), which crawls INEC's portal, checks the result against the IReV-derived list, keeps the snapshot as a 30-day workflow artifact, and loads it. The same commands run locally (see `packages/election-data/src/cli.ts`).

**What the first check found** (on the Oct 2026 copy): the portal and the IReV list agree on every one of the 176,846 codes and on each state's count. The portal lists one ward twice (Benue, Gwer East, ward 09, one copy empty), which the importer merges. About 1.5% of unit names differ between the two, mostly spelling and fuller descriptions; the portal's are newer and win.

**Import plan:**
1. Write our own importer for INEC's CVR locator, so INEC is the source of record. Use the Oct 2026 scrape to build and test it, and cross-check counts and codes against the IReV-derived CSV.
2. Run the importer after the final register (15 Dec 2026), and again in the week before each polling day. Changes are applied as inserts and updates, never deletes, so existing reports keep their unit.
3. Treat coordinates as approximate. Nulls and shared points are allowed; they're used only for "near your unit?" checks and the ward map, never to place an incident.
4. Store INEC's codes exactly as INEC formats them, and accept common typed forms (slashes, dashes, missing leading zeros) when people search.

**Licensing is unresolved.** INEC publishes no terms for this data, and neither third-party copy has a licence. We use the data to let people pick their polling unit, and publish only aggregates. Get legal advice before offering the raw list for download.

## Timeline

About 9 weeks to 16 January, with the Christmas and New Year holidays inside them, so the build has to be done by mid-December.

| Week of | Work |
| --- | --- |
| 16 Nov | Polling-unit importer and data; `election` schema; categories; reports |
| 23 Nov | WhatsApp and web report flows; polling-unit lookup |
| 30 Nov | Geographic roles, invite links, moderator onboarding and training mode |
| 7 Dec | Election-day queue, grouping, labels, escalation |
| 14 Dec | Public live view; partner export; re-import after the final register (15 Dec) |
| 21 Dec – 3 Jan | Holidays: moderator training continues; fixes only |
| 4 Jan | Load test; Supabase sizing; full dry run with moderators; freeze on 9 Jan |
| 16 Jan | **Polling day 1** |
| 6 Feb | **Polling day 2**, with any fixes from day 1 |

**Recruiting and training ~2,000 moderators is the long pole.** It should start now, alongside the build.

## Build tasks

| # | Task | By |
| --- | --- | --- |
| E1 | `election` schema: elections, states, LGAs, wards, polling units (INEC codes), categories, reports, incident grouping; pgTAP tests | 20 Nov |
| E2 | Polling-unit importer (CVR), cross-check against the IReV-derived list, re-runnable without deletes | 22 Nov |
| E3 | Polling-unit lookup: by code (tolerant of formats), menus, search by name | 25 Nov |
| E4 | WhatsApp election flow in the bot state machine; web report flow with photo blur and ballot warning | 29 Nov |
| E5 | Geographic staff roles, invite links, two-factor onboarding, training mode | 6 Dec |
| E6 | Election-day queue: severity, grouping, verify/reject, bulk actions, follow-up replies, escalation alerts | 13 Dec |
| E7 | Labels and corroboration rules; minute-by-minute aggregates by state, LGA and ward | 13 Dec |
| E8 | Public live view and method box; partner CSV/API export | 18 Dec |
| E9 | Load test (50 reports/second sustained, WhatsApp bursts); CDN caching; plan sizing | 8 Jan |
| E10 | Dry run with moderators and scripted test reports; runbook for polling day | 9 Jan |

## Open items

- Confirm the polling dates and the Electoral Act 2026 text from INEC's and PLAC's own sites.
- Legal review under the **Electoral Act 2026** and INEC's 2026 Regulations and Guidelines:
  - phones and photos at the polling unit (the 2022 guidelines barred phones from the voting cubicle, not from the polling unit)
  - the distance rules around a polling unit
  - defamation and publishing allegations
  - our use of the polling-unit data
- Translations: Pidgin first; Hausa, Yoruba and Igbo if time allows.
- The partner list, and what they want in the export.
