# Police reporting: v1 spec

Builds on PRD feature F5 and the architecture doc's police vault. Where this conflicts with either, this spec wins and [DECISIONS.md](DECISIONS.md) records why.

## Decisions (20 Oct 2026)

| Question | Decision |
| --- | --- |
| Follow-up with reporters | **Anonymous message box**: the reporter and moderators exchange messages through the status code. No contact details are ever collected. |
| Commendations for good police conduct | **In v1**, through the same protected form, and forwarded to the CRU and PSC. Named thanks go only through those forwards, never in public. |
| Who receives forwarded reports | **The Police Complaint Response Unit (CRU) and the Police Service Commission (PSC) only.** No NGOs or other partners in v1. |
| Live alerts | **None.** Patterns only, published with a delay. |

## What exists already

- **Intake Worker:** an anonymous form on its own Cloudflare Worker, with logging off, and the visitor's IP and user-agent are never read.
- **Vault database:** the Worker's key can only insert, and every moderator read is written to `police.access_log`.
- **Data protection:** officer details are encrypted so only the admin server can open them; status codes are stored as hashes; locations are snapped to a ~1 km grid.
- **The bridge:** a nightly job pushes aggregates (cells with 3 or more reports, at least 48 hours old) to `public_read.police_patterns`.

Nothing reads back out of the vault yet: no moderation, no forwarding, no public page.

## 1. Report kinds

The form opens with one choice: **"Something went wrong"** or **"An officer did the right thing."**

| Kind | Types |
| --- | --- |
| `misconduct` | `money_demanded`, `phone_searched_harassment`, `unlawful_arrest_detention`, `violence` (unchanged) |
| `commendation` | `refused_bribe`, `helped_me`, `respected_rights`, `professional_conduct` |

Commendations follow the same rules as misconduct reports:
- same privacy protections
- same moderation
- forwarded to the CRU and PSC (as a commendation), with the officer's details when the reporter gave them, so recognition reaches the named officer through official channels
- officer details never public

They appear on the patterns page alongside misconduct.

**Later:** more misconduct types (bail for money, detention past the legal limit, refusal to take a complaint, property seized, profiling, sexual harassment, death or serious injury). Sexual violence and deaths need an escalation route before they're added.

## 2. Status codes and the message box

**Lookup fix (blocker).** Each code is hashed with its own random salt, so a code can't be matched to its report without re-hashing against every row. Add a second, deterministic value alongside the slow hash:

- `status_lookup = HMAC-SHA256(code, STATUS_LOOKUP_KEY)`: unique and indexed, used to find the row. The key is a Worker secret.
- `status_code_hash` (the slow, salted hash) is still checked before anything is returned.

**Longer codes.** Codes now unlock a conversation, not just a status, so move from 4 words (32 bits) to **6 words (48 bits)**. Lookups stay rate-limited by a Cloudflare WAF rule on the route.

**Reporter side (Worker)**
- `GET /status`: enter a code, see the status, the forwarding outcome, and the conversation.
- The reporter can post a message: text only, max 1,000 characters, max 5 a day per report.
- There are no notifications (there's no contact channel), so the page says "Check back with your code."
- Nothing is saved in browser storage, and "Quick exit" is on every page.

**Moderator side (admin):** reply from the report page. Replies must not ask for identifying details; the composer shows a reminder.

**Vault changes**
- Table `police.messages`: `report_id`, `author` (`reporter` or `moderator`), `moderator_id` (null for the reporter), `body`, `created_at`. Kept and purged with the report.
- Three RPCs for the Worker's anon key:
  - `police.code_salt(p_lookup)` returns only that report's salt, so the Worker can compute the slow hash.
  - `police.thread(p_lookup, p_code_hash)` checks the hash inside the database, then returns status, outcome and messages.
  - `police.post_message(p_lookup, p_code_hash, p_body)` checks the hash the same way, then inserts.

  This changes the Worker's role from "insert only" to "insert, and read one report's thread with its code". It still can't list or search anything.

## 3. Moderator console

- **Route:** `/admin/police`, only for staff with the `police_moderator` role. Admins don't get access automatically, so the "two named moderators" rule stays true.
- **Queue:** shows only kind, type, city, age and status, through a list RPC that doesn't return text. **Opening** a report goes through `police.read_report`, which logs the read (already built).

**Actions**
- **Mark consistent:** plausible, on topic, no third party identified. Police reports are never labelled "verified".
- **Reject**, with a reason (shown to the reporter on `/status`).
- **Prepare forwarding:** write a redacted copy of the text for the CRU and PSC. The original is never edited.
- **Reply** in the message box.
- **Record an outcome** (section 4).

**Wellbeing:** photos are blurred until clicked. The queue shows a gentle prompt after 20 opens in a day; it's a prompt, not a hard block, so no one is locked out mid-case.

**Statuses** (replaces `verified` in the current check constraint):

`new` → `consistent` → `forwarded` → `closed`, or `rejected`

Forwarding outcome is a separate field (below), so "forwarded, no response" still counts as forwarded.

## 4. Forwarding to the CRU and PSC

- **Consent required.** Only reports with `consent_to_forward = true` can be forwarded. The rest still count towards patterns.
- **v1 is manual.** The console builds a **forwarding pack** to copy or download:
  - kind and type
  - date (`occurred_on` or the `when` bucket)
  - city
  - place as typed
  - the redacted text
  - officer details, decrypted, since that's what the CRU needs to act
  - our report reference

  It never includes the status code, timestamps finer than the day, or anything about the reporter. The official contacts moderators send to are listed in `apps/web/modules/vault/recipients.ts` (CRU phone numbers to be supplied by the project owner). The moderator sends it from the project's own email or through the CRU's official channels, then records `forwarded_at`, the channel, and any reference number the CRU or PSC gives back. (Sending the pack automatically through an email API would put report content through another third party, so leave it out of v1.)
- **Outcome**, set by the moderator:
  - `awaiting`
  - `acknowledged`
  - `action_reported`
  - `no_response`, set automatically 30 days after forwarding with no update

  The reporter sees the outcome on `/status`.
- **Public accountability:** a monthly total, per city and per recipient, of forwarded, acknowledged, action reported and no response. These totals are about the institutions, not reporters, so they can be published as soon as the month closes.

## 5. Patterns page

Public page at `/police` in the web app. It reads `public_read.police_patterns` and the forwarding totals:

- a map of ~1 km cells, shaded by count, filterable by kind and type
- trend by month
- forwarding outcomes by recipient
- a method box: what's counted, the 3-report minimum, the delay, and why individual reports are never shown

**Recommended change (safety).** The bridge currently rewrites the current month every night. Someone watching the counts day by day could see a cell go from 3 to 4 and know a report was filed there about two days earlier. To close that:
- publish a month **only after it ends** (plus the 48-hour delay), and
- show counts in **bands** (3–5, 6–10, 11–25, 25+) rather than exact numbers.

That means patterns lag by up to a month. You accepted no live alerts, so this fits, but it's a real trade-off.

**Optional field:** a time-of-day bucket (morning, afternoon, evening, night) makes patterns like "mostly 6–9pm" possible without much identifying power. Add it to the form, and publish it only once a cell has 10 or more reports.

**Later:** grouping by police command or division. It needs division boundaries, which we don't have.

## 6. Help panel ("Someone is detained right now")

This is static content on the Worker form and the `/status` page:
- official CRU contact channels
- a reminder that bail is free
- the right to a lawyer
- a message template to send a family member
- 112 for immediate danger (already on the form)

**Every number and channel must be checked against official sources before launch**, and re-checked quarterly. We don't handle urgent cases ourselves, and the panel says so.

## Build tasks

In order. Sizes are rough part-time estimates (S under 1 day, M 1–3 days, L about a week).

| # | Task | Size | Depends on |
| --- | --- | --- | --- |
| 1 | Vault migration: `kind`, commendation types, `status_lookup`, `consistent` status, forwarding fields and outcome, time-of-day bucket, `police.messages`, list/thread/post RPCs, outcome sweep job, pgTAP tests | M | — |
| 2 | Validation package: report kinds, commendation types, time of day, message schema | S | — |
| 3 | Worker: 6-word codes plus `status_lookup`; kind choice on the form; `/status` page with the thread and posting; Turnstile check on submit and post | M | 1, 2 |
| 4 | Admin `/admin/police`: queue, open (logged), mark consistent or reject, redaction, reply | L | 1 |
| 5 | Forwarding pack, recording of channel, reference and outcome | M | 4 |
| 6 | Bridge: completed months only, banded counts, kind dimension, forwarding totals; matching civic migration | M | 1 |
| 7 | Public `/police` patterns page and method box | M | 6 |
| 8 | Help panel content, with sources checked | S | — |
| 9 | Photo upload: signed upload to the vault bucket, on-device face and plate blur, EXIF strip | L | 3 |
| 10 | Deploy: vault Supabase project, Worker on its own domain, WAF rate-limit rule, secrets | M | 3 |
| 11 | Move status-code hashing to Argon2id (already in DECISIONS.md as a pre-launch item) | S | 3 |

**Launch gate (unchanged from the architecture doc):**
- independent security review of the Worker and vault
- a check that no IP, user-agent or cookie reaches any log, row or response
- legal review
- two trained police moderators

## Open items

- **Who the two police moderators are**, and their safety training.
- **The CRU and PSC channels** we'll forward through, and whether either will give us a contact for follow-ups.
- **Accepting the monthly publishing and banded counts** recommended in section 5.
