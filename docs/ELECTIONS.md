# Election reporting: v1 spec

Citizens report what happens at their polling unit on election day. Reports roll up from **polling unit → ward → LGA → state** into a public live situation view, and feed partners such as citizen observation groups.

## Decisions (11 Nov 2026)

| Question | Decision |
| --- | --- |
| Which election | The **general election**: all 36 states and the FCT. |
| What citizens report | **Incidents and process only.** No vote counts, no results tallies. Only INEC declares results. |
| Moderation | **Every state and the FCT**, ideally a few moderators per LGA (roughly 2,000 or more people). |
| Partners | Planned: citizen observation groups and others. v1 makes verified data exportable to them. |

## Principles

- **Neutral.** We report process and incidents, never who's winning. Party or candidate names appear only as a reporter alleged them, and only after moderation.
- **Ballot secrecy.** The form tells people never to photograph a marked ballot. Photos are for queues, materials, damage and posted notices.
- **Reporter safety.** Reports are anonymous by default; a phone number is optional and only for WhatsApp replies. Faces in photos are blurred on the phone, using the police photo pipeline.
- **Fast but labelled.** Election reporting is only useful live, so counts publish within minutes. Every figure says how sure we are: reported, corroborated, or verified by a moderator.
- **No pinpointing danger.** Violence and intimidation never show below ward level in public, so a report can't steer people to, or expose, a specific polling unit.

## Geography

INEC's hierarchy is **state → LGA → registration area (ward) → polling unit**, with polling-unit codes in the form `SS-LL-WW-PPP` (state, LGA, ward, unit).

- **Scale:** ~176,846 polling units, 8,809 wards and 774 LGAs (to be confirmed against the source chosen below).
- **Storage:** reference tables in a new `election` schema, keyed by INEC code. These are separate from `core.lgas`, which holds map boundaries for the civic pilot.
- **Elections:** a general election is two polling days (presidential and National Assembly, then governorship and state assembly). Each is an `election` row, so reports, queues and the public view are per day.

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
| Counting | Counting disrupted or done away from the polling unit | critical |
| Counting | Result sheet (EC8A) not posted at the polling unit | high |
| Any | Other | medium |
| Any | **All went smoothly** (a positive report, like Wins) | info |

The list will be cross-checked against established observer taxonomies before it's final.

## How people report

**WhatsApp (main channel).** An election flow in the existing bot:
1. Choose the polling unit by typing its code (on the voter's card and INEC slips), or by state → LGA → ward → unit menus.
2. Choose a category.
3. Optionally add a short description and a photo.
4. Get a reference to check later.

Short replies throughout, because election day means weak data and long queues.

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

_To be completed from the data-source research: where INEC publishes the list, format, completeness, coordinates and licence, and the chosen import path._

## Timeline (8 weeks to the first polling day)

| Week | Work |
| --- | --- |
| 1 | Polling-unit data import; `election` schema; categories; reports |
| 2 | WhatsApp and web report flows; polling-unit lookup |
| 3 | Geographic roles, invite links, moderator onboarding and training mode |
| 4 | Election-day queue, grouping, labels, escalation |
| 5 | Public live view; partner export |
| 6 | Load test; Supabase sizing; moderator recruitment in full swing |
| 7 | Full dry run with moderators and test reports; fixes; freeze |
| 8 | Polling day 1. The second polling day follows about two weeks later. |

Recruiting and training ~2,000 moderators is the long pole and should start in week 1, alongside the build.

## Open items

- The exact polling dates, from INEC's timetable.
- Final category list, after checking observer taxonomies, and translations (Pidgin first; Hausa, Yoruba, Igbo if time allows).
- The partner list, and what they want in the export.
- Legal review: Electoral Act rules on phones and photos at polling units, defamation, and publishing allegations.
