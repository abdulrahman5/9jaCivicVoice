# CivicVoice NG — v1 PRD & Tech Stack

Oct 19, 2026 · @Tobi

## Summary

CivicVoice v1 is a WhatsApp bot and a mobile website where Nigerians in Lagos and FCT Abuja report failures in public services and police misconduct. The reports feed a public scorecard of how agencies respond. One person can build it part-time in about 12 weeks, for about $40–60 a month to run.

- **Positioning:** independent watchdog. We publish response rates whether or not agencies take part, and we give public credit when things get fixed.
- **Pilot:** Lagos and FCT Abuja.
- **Team:** a side project. One builder plus 2–3 volunteer moderators.
- **v1 categories:** roads and drainage, electricity, water, health facilities, public services (delays), and police conduct (a protected flow).
- **v2:** corruption (bribes in offices, contracts, budget tracking), USSD, an agency dashboard, and more states.

Wireframes: CivicVoice NG Wireframes canvas (rows 1–4).

## Problem, goals and success metrics

Citizens have no easy, safe way to report service failures, and agencies face no public cost for ignoring them. v1 tests one hypothesis: **if reports are easy to file and agency responsiveness is published, agencies will respond more often and faster.**

**Goals for the first 90 days after launch**

1. Prove demand: people in both pilot cities file reports without paid promotion.
2. Close the loop: a measurable share of reports gets an agency response.
3. Build credibility: journalists or CSOs cite the scorecard publicly at least once.

**Non-goals for v1:** emergency response, native apps, USSD, agency logins, corruption reporting, states beyond the pilot, monetisation.

| Metric | Definition | 90-day target |
| --- | --- | --- |
| North star: confirmed fixes | Issues the reporter (or 3+ residents) confirms as fixed, per month | 25 / month by day 90 |
| Reports filed | Verified reports across both cities | 1,000 total |
| Acknowledgement rate | Share of forwarded issues an agency acknowledges within 7 days | 20% |
| Repeat reporters | Reporters who file or "Me too" again within 30 days | 25% |
| Time to verify | Median time from submission to moderator verification | under 24 hours |
| Safety incidents | Any reporter identified or harmed through the platform | 0 (stop-ship) |

Targets are first guesses to revisit after week 4 of the pilot.

## Users

v1 serves five kinds of user. Only citizens and moderators use it daily; agencies and media only receive and read.

| User | Core job | v1 surface |
| --- | --- | --- |
| Citizen reporter | "Get this fixed, and know if anyone heard me" | WhatsApp bot, mobile web report flow, report tracking |
| Citizen at risk (police) | "Report what happened without being identified" | Protected police flow (web), one-time status code |
| Moderator (you + volunteers) | "Verify, de-duplicate, protect reporters, route fast" | Lite moderation console |
| Agency staff | "See what's reported about us and respond publicly" | Email digest + no-login "Respond to this issue" link |
| Journalist / CSO / public | "See which agencies respond and where problems cluster" | Public map, scorecard, Wins, police patterns, CSV export |

## v1 scope

The P0 features below are what launch needs; P1 can ship in the first month after launch. Anything not listed is out of v1.

| # | Feature | Priority | Wireframe |
| --- | --- | --- | --- |
| F1 | WhatsApp reporting bot | P0 | 2.1 |
| F2 | Mobile web report flow | P0 | 1.2, 1.3 |
| F3 | Duplicate detection and "Me too" | P0 | 1.3, 1.5 |
| F4 | Report tracking and citizen confirmation | P0 | 1.4 |
| F5 | Protected police conduct flow | P0 | 4.1 |
| F6 | Lite moderation console | P0 | 3.1 |
| F7 | Agency forwarding and no-login response link | P0 | (email) |
| F8 | Public scorecard | P0 | 3.3 |
| F9 | Public issue map | P1 | 1.5 |
| F10 | Wins feed and share cards | P1 | 4.3 |
| F11 | Police patterns view | P1 | 4.2 |
| F12 | Pidgin, Hausa, Yorùbá, Igbo UI text | P1 | 1.2 |

### F1 · WhatsApp reporting bot

*As a citizen, I want to report an issue in WhatsApp so I don't need to install or learn anything new.*

- [ ] "Hi" to the number starts a menu: Report, Track, Language
- [ ] Collects category, location (shared pin or typed area), and a photo, voice note or text
- [ ] Returns a reference number within 5 seconds of the last message
- [ ] Sends a WhatsApp message on every status change, using approved templates
- [ ] "Track" plus a reference number returns the current status and the latest agency reply
- [ ] An unfinished session times out after 30 minutes and saves a draft
- [ ] Police reports are NOT accepted in WhatsApp; the bot sends the protected web link instead (WhatsApp exposes the phone number)

### F2 · Mobile web report flow

*As a citizen with a smartphone, I want to report in under 60 seconds.*

- [ ] 3 steps: category and sub-type → location and evidence → review
- [ ] Location from GPS, with LGA and ward filled in automatically and an option to drag the pin
- [ ] Up to 3 photos, compressed on the device to 300 KB or less each; EXIF data stripped before upload
- [ ] Voice note up to 60 seconds
- [ ] Anonymous by default; a phone number is optional and only used for updates
- [ ] First load under 200 KB of JavaScript; usable on a 3G connection
- [ ] Drafts survive a lost connection (stored locally, sent when back online)

### F3 · Duplicate detection and "Me too"

- [ ] Before submit, show open reports in the same category within 500 m from the last 30 days
- [ ] "Me too" adds the person to an existing issue with one tap, no new report
- [ ] Moderators can merge reports; merged reporters all receive updates

### F4 · Tracking and citizen confirmation

- [ ] Status timeline shows every change with its date and the agency's public reply
- [ ] Once marked resolved, the reporter gets an "Is it fixed?" prompt with Yes and Not yet
- [ ] "Not yet" reopens the issue and counts against the agency's resolution rate
- [ ] With no reply for 14 days, the issue is marked "Resolved (unconfirmed)", and the scorecard counts it separately

### F6 · Lite moderation console

*As a moderator, I want to clear the queue in under 1 minute per report.*

- [ ] Queue filtered by city, category, channel and flag; oldest first
- [ ] Actions: verify, merge, edit category, blur image areas, reject with a reason, route to an agency
- [ ] Automatic flags: possible duplicate, face or plate in the photo, a police report, off-topic
- [ ] Voice notes transcribed automatically, with the transcript shown next to the audio
- [ ] Every action is logged with the moderator and time (audit trail)
- [ ] Roles: admin and moderator; police reports visible only to moderators who've had safety training

### F7 · Agency forwarding and response link

- [ ] Each verified issue is emailed to the agency's listed contact, with a unique link that needs no login
- [ ] On the link page, the agency can post a public reply and set Acknowledged, In progress or Resolved
- [ ] Weekly digest email per agency: open issues, overdue issues, current scorecard rank
- [ ] Optional: a post on X tagging the agency for issues with 25 or more "Me too"s (moderator approves)
- [ ] Agency directory maintained by hand: about 15 agencies per city at launch

### F8 · Public scorecard

- [ ] For each agency and city: reports received, % acknowledged within 7 days, median days to resolution, % citizen-confirmed
- [ ] An agency needs at least 10 reports in the period before it's ranked
- [ ] Methodology page published; CSV download of aggregated, anonymised data
- [ ] Recalculated nightly

F5 (police) is specified in the next section. F9–F12 follow the wireframes and need no extra criteria for v1.

## F5 · Police conduct and trust & safety

Police reporting launches only if every requirement below passes review. If one fails, police reporting is held back while the rest of v1 ships.

*As someone who faced police extortion or abuse, I want to report it without anyone being able to trace it to me.*

**Collection**

- [ ] Web only, with no account; no phone number, email or IP address is stored (logging turned off at the edge for police routes)
- [ ] Faces and number plates blurred and EXIF stripped on the device, before upload; the original image never leaves the phone
- [ ] Officer unit, vehicle or name tag is optional, held in a separate encrypted column, and never published
- [ ] The reporter gets a one-time status code (e.g. 4 words); it can't be recovered
- [ ] A "Quick exit" button clears the form and loads a neutral page; nothing is saved in browser storage after submit
- [ ] A banner sends anyone in immediate danger to 112

**Publication**

- [ ] Individual police reports are never published
- [ ] Public view shows only patterns: location snapped to a grid of about 1 km, at least a 48-hour delay, and at least 3 reports per area before anything shows
- [ ] Officer names never appear anywhere public, including the CSV export

**Routing and access**

- [ ] With the reporter's consent, verified reports go to the Nigeria Police Force Complaint Response Unit and the Police Service Commission, without reporter metadata
- [ ] Only 2 named, trained moderators can open police reports; every view is logged
- [ ] Raw police reports are deleted 12 months after closing; only the aggregates are kept
- [ ] Optional referral to a legal-aid partner, only when the reporter asks and with contact details they choose to give

**Applies to all reports**

- [ ] Complies with the Nigeria Data Protection Act 2023: privacy notice, consent text, data minimisation, deletion on request, breach response plan
- [ ] No personal data in the public map, scorecard or CSV
- [ ] Moderators approve every photo before it goes public
- [ ] Clear content rules: no naming private individuals, no hate speech or partisan campaigning
- [ ] Pre-launch legal review covering defamation, Cybercrimes Act exposure and the takedown process

## Status model and moderation workflow

Every channel shares one status model, and only the reporter (or 3+ residents) can move an issue to "Confirmed fixed".

> *Diagram: issue status model · 8 states. It is only in the live doc (link in [README](README.md)).*

"Not yet" reopens the issue and counts against the agency. Merged reports inherit the existing issue's status and updates.

| Status | Set by | Reporter notified | Target time |
| --- | --- | --- | --- |
| Received | System | Yes, with reference number | Instant |
| Verified | Moderator | No (avoids noise) | Within 24 hours |
| Forwarded | Moderator | Yes, with the agency's name | Same day as verified |
| Acknowledged | Agency (via link) or moderator | Yes, with the agency's reply | Within 7 days of forwarding |
| Marked resolved | Agency or moderator | Yes, with an "Is it fixed?" prompt | — |
| Confirmed fixed | Reporter or 3+ residents | Yes, with a share card | — |
| Unconfirmed | System, after 14 days | No | — |
| Rejected / merged | Moderator | Yes, with the reason or the merged issue | Within 24 hours |

**Daily moderator routine (about 30–45 minutes):** clear police reports first, then the oldest flagged items, then the rest. Update the agency directory when emails bounce.

## Tech stack

Use managed services only: one Next.js app, one Supabase project and pay-per-use APIs. That costs about $40–60 a month at pilot volume, with no servers to look after.

> *Diagram: v1 architecture · 1 app, 1 database, 4 managed services. It is only in the live doc (link in [README](README.md)).*

Agencies' replies come back through the no-login response pages in the same app. The WhatsApp bot and the web flow write to the same tables, so every channel shares one status model.

| Layer | Choice | Why | Alternative |
| --- | --- | --- | --- |
| Web app and API | Next.js (React) on Vercel, server-rendered with little client-side JavaScript | One codebase for the PWA, bot webhook, admin and public pages; free tier to start | SvelteKit on Cloudflare Pages (smaller bundles) |
| Database | Supabase Postgres + PostGIS | Spatial queries for duplicates and ward lookup; row-level security; auth, storage and cron included | Neon + a separate storage service |
| WhatsApp | Meta WhatsApp Cloud API directly (no BSP) | Cheapest; replies to citizen-started chats within 24 hours are free; templates for status updates | Twilio (easier setup, costs more) |
| AI triage | Claude Haiku 5.5 (`claude-haiku-5-5`) via the Anthropic API | Suggests a category, flags PII or names in the text, translates Pidgin, Yorùbá, Hausa and Igbo for moderators; suggestions only, a human decides | — |
| Speech-to-text | OpenAI Whisper API to start; test Nigerian-language models | Voice notes are the main input for many users; check accuracy on Pidgin and Hausa early | A Nigerian-language STT provider |
| Image privacy | MediaPipe face detection in the browser, plus a tap-to-blur tool for number plates | Blurring happens on the phone, so originals never reach the server | — |
| Maps and boundaries | MapLibre GL + OpenStreetMap tiles; GRID3 Nigeria ward and LGA boundaries loaded into PostGIS | Free; LGA and ward come from a point-in-polygon lookup, no paid geocoder | Mapbox |
| Email | Resend | Free tier covers forwarding and digests at pilot volume | Postmark |
| Monitoring and analytics | Sentry (errors), Plausible or Umami (no cookies), both off on police routes | Privacy-friendly, cheap | — |

**Rough monthly cost at pilot volume** (about 1,000 reports a month; prices approximate, check current rate cards)

| Item | $ / month |
| --- | --- |
| Supabase Pro (backups, no pausing) | 25 |
| WhatsApp template messages (status updates) | 5–20 |
| Claude Haiku triage | under 5 |
| Whisper transcription (about 1,000 minutes) | about 6 |
| Vercel, Resend, Sentry, map tiles (free tiers) | 0 |
| Domain (about $15 a year) | about 1 |
| **Total** | **about 40–60** |

Start on Supabase's free tier while building, and move to Pro the week before launch.

## Data model

Eight Postgres tables cover v1. Police reports live in their own table with tighter access rules, so a bug in the public queries can't leak them.

| Table | Key fields | Notes |
| --- | --- | --- |
| `issues` | id, ref\_code, category, subcategory, status, city, lga, ward, location (PostGIS point), metoo\_count, agency\_id, created\_at, resolved\_at, confirmed | One public issue; reports merge into it |
| `reports` | id, issue\_id, channel (whatsapp/web), description, transcript, contact\_hash (nullable), language, created\_at | One citizen submission; contact stored as a salted hash for notifications only |
| `media` | id, report\_id, storage\_key, type, blurred, approved\_by | Private storage bucket; public only after approval |
| `status_events` | id, issue\_id, from\_status, to\_status, actor\_type (moderator/agency/citizen/system), public\_note, created\_at | Drives both the timeline and the scorecard maths |
| `agencies` | id, name, city, category\_scope, contact\_emails, x\_handle, response\_token | Hand-maintained directory |
| `metoos` | issue\_id, contact\_hash or device\_id, created\_at | One per person per issue |
| `police_reports` | id, incident\_type, grid\_cell, occurred\_at, officer\_details (encrypted), media\_key, status\_code\_hash, forwarded\_at | Separate table; locked down with row-level security; never joined to public views |
| `audit_log` | id, actor\_id, action, target\_table, target\_id, created\_at | Every moderator action and every police-report view |

The scorecard is a nightly materialised view over `status_events` and `issues`, not a live query.

## Milestones

At about 10–12 hours a week, v1 reaches public launch in 12 weeks. Police reporting has its own gate, so it can't hold up the rest of the launch.

> *Diagram: v1 roadmap · 6 phases, 2 gates, 12 weeks. It is only in the live doc (link in [README](README.md)).*

If the police gate isn't passed by week 12, launch everything else and switch police reporting on when it passes. Review the metrics at week 4 after launch, then decide on the v2 order: corruption, agency dashboard or USSD.

## Risks and open questions

The biggest risk is not technical: it's moderation capacity and the safety of police reporters.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| A police reporter is identified | Low | Severe | F5 safeguards, legal review, launch gate, 2 trained moderators only |
| Moderation backlog (side project) | High | High | Cap police reports at 100 a month at launch; recruit 3 volunteers before launch; automatic flags and transcripts |
| Agencies ignore everything | High | Medium | Expected for a watchdog; publish anyway; celebrate the first responders through Wins; partner with media |
| Fake or politically motivated reports | Medium | High | Verification before publishing, "Me too" as corroboration, reject partisan content, a public methodology |
| Legal threats (defamation, Cybercrimes Act) | Medium | High | No naming individuals, takedown process, legal-aid or media-law partner |
| WhatsApp number banned or rate-limited | Low | High | Use the official Cloud API only, approved templates, opt-in messaging |
| Burnout of a solo builder | High | High | Strict v1 scope, managed services only, no custom infrastructure |

**Open questions**

- [ ] Does checkpoint extortion count as police conduct (v1) or corruption (v2)? Assumed: police conduct, v1
- [ ] Which media or CSO partner will amplify the scorecard at launch?
- [ ] Who are the first 3 volunteer moderators, and who gets safety training for police reports?
- [ ] Legal-aid referral partner for police reports: which organisation, and on what terms?
- [ ] Product name and domain ("CivicVoice" is a placeholder)
- [ ] Is the X auto-tagging threshold of 25 "Me too"s the right bar?
