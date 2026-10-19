# CivicVoice NG — System Architecture

Oct 19, 2026 · @Tobi

## Architecture at a glance

CivicVoice is a **modular monolith** split into **two trust zones**:

- **Civic zone:** a Next.js app plus a Supabase database. It handles everything public.
- **Police vault:** a separate minimal intake service plus a separate database. It holds police reports and nothing else.

Everything runs on managed services, so one part-time developer can build and run it for about $50–75 a month.

This builds on the v1 PRD and the wireframes. Where it differs from the PRD's stack, the police isolation decisions (D2, D3, D7) are the reason.

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| D1 | App shape | One Next.js (App Router) app in a pnpm monorepo, split into route groups by audience | One deploy, one codebase; module boundaries enforced by folder rules, not network calls |
| D2 | Police isolation | Police intake runs as a separate Cloudflare Worker with request logging off, writing to a separate Supabase project | A bug, a log, a backup or an admin mistake in the civic zone can't expose police reporters |
| D3 | Databases | Supabase Postgres + PostGIS: one civic project and one police-vault project | Hard isolation is cheaper and safer than row-level rules alone |
| D4 | Async work | Postgres-native queue (Supabase Queues / pgmq) and pg\_cron, processed by Supabase Edge Functions | No extra infrastructure; jobs live in the same database as the data they change |
| D5 | Citizen identity | No accounts. Tracking by reference code plus a secret token; WhatsApp numbers stored only as salted hashes | Data minimisation under the NDPA 2023; nothing to leak |
| D6 | Staff identity | Supabase Auth with required TOTP 2FA for moderators; signed, expiring links for agencies | Agencies never need accounts; moderators are few and high-privilege |
| D7 | AI | Claude Haiku 5.5 for civic triage only. Police reports never go to any third-party AI in v1 | Triage speeds up moderation; police text is too sensitive to leave the vault |
| D8 | Hosting | Vercel (app), Cloudflare (DNS, police Worker, backup storage), Supabase (data) | Free or cheap tiers, preview deploys, no servers to patch |
| D9 | Environments | Local (Supabase CLI) → preview per pull request → production | Enough safety for a solo developer without a full staging stack |

## System context and containers

The system has two trust zones joined by exactly one one-way channel: nightly grid aggregates flowing from the vault to the civic database.

> *Diagram: system containers · 2 trust zones, 4 external services. It is only in the live doc (link in [README](README.md)).*

Moderators read the vault only through server-side admin routes in the Next.js app, using a separate key. Nothing in the vault ever goes to Claude, Sentry or any analytics tool.

## Codebase structure

The whole system lives in one pnpm + Turborepo monorepo with two deployable apps and shared packages. The police app is allowed to import only `packages/shared-ui` and `packages/validation`, never the civic database client. A lint rule enforces this.

```text
civicvoice/
├─ apps/
│  ├─ web/                      # Next.js (App Router) → Vercel
│  │  ├─ app/
│  │  │  ├─ (public)/           # map, scorecard, wins, police patterns, methodology
│  │  │  ├─ (report)/           # 3-step report flow, tracking (PWA)
│  │  │  ├─ (admin)/            # moderation console (auth + 2FA)
│  │  │  ├─ (agency)/r/[token]/ # no-login agency response pages
│  │  │  └─ api/
│  │  │     ├─ whatsapp/webhook/ # verify signature → enqueue → 200
│  │  │     └─ reports/          # web submissions, me-too, confirm
│  │  ├─ modules/               # domain logic: issues, routing, scorecard, bot
│  │  └─ public/sw.js           # service worker: offline drafts
│  └─ police-intake/            # Cloudflare Worker + static form, logging off
├─ packages/
│  ├─ db/                       # civic schema types, query helpers (server-only)
│  ├─ vault-db/                 # police vault client (used by admin only)
│  ├─ validation/               # zod schemas shared by client + server
│  ├─ shared-ui/                # design tokens, form components
│  ├─ media/                    # on-device face blur (MediaPipe), EXIF strip, compression
│  └─ i18n/                     # EN, Pidgin, Hausa, Yorùbá, Igbo strings
├─ supabase/
│  ├─ civic/migrations/         # SQL migrations, RLS policies, views, cron
│  ├─ civic/functions/          # Edge Functions: job workers
│  └─ vault/migrations/
└─ .github/workflows/            # CI, migrations, backups
```

**Module rules inside `apps/web`**

- Route handlers stay thin: validate with zod, call a function in `modules/`, return.
- Only `modules/` talks to the database; React components never import `packages/db`.
- The `(admin)` routes are the only code that imports `packages/vault-db`, and only on the server.
- The WhatsApp bot is a state machine in `modules/bot`, unit-tested without calling WhatsApp.

## Key flows

In every flow, a request does the minimum and returns; workers do the slow, failure-prone work. This WhatsApp report shows the pattern from first message to agency update.

> *Diagram: WhatsApp report, end to end · 14 steps. It is only in the live doc (link in [README](README.md)).*

The web report flow is the same from "enqueue" onwards. The difference: the PWA uploads media straight to private storage with a signed upload URL, after blurring and stripping EXIF on the phone.

**Police report (vault only)**

1. The browser loads the static form from the Worker. No cookies, no analytics.
2. On the phone: face blur, plate blur, EXIF strip and compression.
3. The browser asks the Worker for a one-time signed upload URL for the vault bucket, then uploads the media.
4. The Worker validates the form and encrypts the officer details with the public key. It inserts the row with its insert-only role, never reading IP or user-agent headers.
5. The Worker generates the 4-word status code and stores only its Argon2 hash; the code is shown once.
6. A police moderator opens the report in the admin console. The server decrypts the officer details, and `access_log` records the view.
7. With consent, the moderator forwards it to the Complaint Response Unit. The nightly bridge publishes grid aggregates only.

**Agency response and citizen confirmation**

1. The agency opens its signed link. Next.js checks the HMAC, expiry and revocation, then shows the issue.
2. The agency posts a public reply and sets a status. A `status_events` row is inserted, and a trigger enqueues `notify_citizen`.
3. On "Marked resolved", the citizen gets the `fix_confirm_request` template with Yes and Not yet buttons.
4. The button reply comes back through the webhook. "Yes" means Confirmed fixed (a share card is sent); "Not yet" reopens the issue.
5. The nightly scorecard refresh picks up the change.

## Data architecture

Civic data sits in three Postgres schemas with different access rules. Police data lives in a different database altogether. The public internet only ever reads from the `public_read` schema.

| Zone | Where | Contents | Who can read | Who can write |
| --- | --- | --- | --- | --- |
| `core` | Civic DB | issues, reports, media, status\_events, metoos, agencies | Server code (service role); moderators via RLS | Server code only |
| `public_read` | Civic DB | Views and materialised views: published issues (no contact data), scorecard, wins, police aggregates | Anyone (anon key) | Nobody; refreshed by cron |
| `ops` | Civic DB | job queue (pgmq), audit\_log, moderator profiles, agency tokens | Admins | Server code, triggers |
| `vault` | Police vault DB | police\_reports, police\_media, status\_codes, access\_log | 2 named moderators via server-side admin routes | Police Worker (insert only) |

**Rules that keep it safe**

- RLS is on for every table; the anon key can only `SELECT` from `public_read`.
- Contact data is stored only as `HMAC-SHA256(phone, pepper)`. The pepper lives in Vault secrets, not the database. A raw number exists only in memory while a WhatsApp message is being sent.
- Location stored as PostGIS `geography(Point)` with a GiST index. LGA and ward are filled at insert by a `ST_Contains` lookup against GRID3 boundary tables.
- Duplicate check: `ST_DWithin(location, :point, 500)` + same category + status not closed + created in the last 30 days.
- The scorecard is a materialised view refreshed nightly, plus a refresh after bulk moderation. Public pages are cached at the CDN for 5 minutes.
- Police aggregates are computed **inside the vault**: snapped to a 1 km grid, delayed 48 hours, at least 3 reports per cell. Only those aggregates are pushed to `public_read.police_patterns` by a nightly job. Raw rows never cross over.

**Storage**

- Bucket `media-private`: uploads, already blurred and EXIF-stripped on the device. Served to moderators via signed URLs that expire in 10 minutes.
- Bucket `media-public`: copies made only after a moderator approves them, resized to 1080 px WebP.
- Police media lives in the vault project's own private bucket and is never published.

**Retention**

| Data | Kept for |
| --- | --- |
| Civic issues and aggregates | Indefinitely (public record) |
| Contact hashes | 90 days after an issue closes |
| Rejected reports and their media | 30 days |
| Raw police reports and media | 12 months after closing, then hard-deleted; aggregates kept |
| Audit and access logs | 2 years |

## Security and privacy architecture

The threat that matters most is a police reporter being identified, whether through logs, metadata, a breach or a legal demand. Every control below assumes the civic zone could be compromised, and keeps the vault safe even then.

**Police vault controls**

- The intake Worker has Workers Logs and Logpush turned off, no analytics, and no third-party scripts. It drops the `CF-Connecting-IP` and `User-Agent` headers before any code reads them.
- The form is static HTML + JS under 50 KB with a strict CSP (`default-src 'self'`) and no cookies. Blurring and EXIF stripping run on the device, before upload.
- The Worker holds an **insert-only** database role for the vault. It can't read anything back.
- Officer details are encrypted in the app (libsodium sealed box) with a public key. The private key sits only in the admin server's environment.
- The status check uses a 4-word code: only its Argon2 hash is stored, and lookups are rate-limited.
- Moderators reach the vault only through `(admin)` server routes. Each open writes a row to `vault.access_log` and emails an admin a daily digest.
- One-way bridge: a nightly vault job pushes only grid-level aggregates to the civic DB, using a role that can write to one table and nothing else.

**Civic zone controls**

- WhatsApp webhook: verify the `X-Hub-Signature-256` HMAC before parsing, reject replays by message ID, and answer 200 within 1 second after enqueueing.
- Every public POST: zod validation, a per-IP + per-device rate limit (Upstash Redis or the Vercel firewall), and Cloudflare Turnstile on web submissions.
- Agency links: an HMAC-signed token scoped to one agency, expiring after 30 days, and revocable through `ops.agency_tokens`.
- Moderators: Supabase Auth, TOTP 2FA required, 12-hour sessions, roles `admin` / `moderator` / `police_moderator` checked in RLS and in server code.
- Untrusted text is never rendered as HTML. The prompt sent to Claude wraps citizen text in delimiters and asks for JSON-only output, validated with zod before use.

**Secrets and keys**

| Secret | Lives in | Rotation |
| --- | --- | --- |
| Supabase service-role keys (civic, vault) | Vercel env (production only); vault key also in the Worker secret store | On staff change |
| WhatsApp access token + app secret | Vercel env | 60 days (system user token) |
| Anthropic, STT, Resend API keys | Vercel env | 90 days |
| Phone-hash pepper, agency-token HMAC key | Supabase Vault | Yearly, with dual-key overlap |
| Officer-details private key | Vercel env, admin routes only; offline paper backup | Only if compromised |

**NDPA 2023 compliance hooks:** privacy notice per channel, consent captured with every report, a data-subject request process (look up by reference code), a breach response plan (notify NDPC within 72 hours), and records of processing. Data is hosted outside Nigeria (Supabase EU region), so document the cross-border transfer basis.

## Async processing

Anything slow or unreliable runs as a queued job, never inside a user's request. Requests write a row and enqueue; workers do the rest and can be retried safely.

**How it runs:** queues are Supabase Queues (pgmq) in the `ops` schema. pg\_cron calls a worker Edge Function every minute (or straight after an enqueue, via `pg_net`). Each worker reads up to 10 messages with a 60-second visibility timeout, processes them, then deletes them. After 5 failed attempts a message moves to a `dead_letter` queue and an alert fires.

| Queue / job | Triggered by | Does | Idempotency key |
| --- | --- | --- | --- |
| `wa_inbound` | WhatsApp webhook | Runs one step of the bot state machine, saves the draft, replies | WhatsApp message ID |
| `media_fetch` | Bot receives a photo or voice note | Downloads it from the Meta media URL (expires in about 5 min) into private storage | Media ID |
| `transcribe` | Voice note stored | Speech-to-text, saves the transcript to the report | report\_id |
| `triage` | Report submitted (civic only) | Claude Haiku suggests a category and flags PII or names; saves suggestions for the moderator | report\_id + prompt version |
| `notify_citizen` | Status event inserted (trigger) | WhatsApp template message or web push | status\_event\_id |
| `forward_agency` | Issue verified and routed | Emails the agency with a signed response link | issue\_id + agency\_id |
| `publish_media` | Moderator approves a photo | Resizes and copies it to the public bucket | media\_id |

| Scheduled (pg\_cron) | When (WAT) | Does |
| --- | --- | --- |
| Refresh scorecard + wins views | 02:00 daily | `REFRESH MATERIALIZED VIEW CONCURRENTLY` |
| Police aggregates bridge | 02:30 daily (vault) | Grid, delay and threshold rules, then push to civic |
| Unconfirmed sweep | 03:00 daily | Marks resolved issues with no reply for 14 days as "Unconfirmed" |
| Agency digest | Monday 08:00 | Weekly email per agency |
| Retention purge | 04:00 daily | Deletes data past the retention table |
| Backup export | 01:00 daily | GitHub Action: `pg_dump` → encrypted → Cloudflare R2 |

The WhatsApp 24-hour rule: free-form replies only within 24 hours of the citizen's last message. Status updates after that use pre-approved utility templates (e.g. `status_update`, `fix_confirm_request`).

## Environments and CI/CD

There are three environments and one pipeline. Every pull request gets its own preview app and database branch. Production changes only through a tagged release that runs the migrations first.

| Environment | App | Database | WhatsApp | Data |
| --- | --- | --- | --- | --- |
| Local | `pnpm dev` | Supabase CLI (Docker), both civic and vault schemas | Mock server + recorded webhook fixtures | Seed script with fake Lagos/FCT data |
| Preview (per PR) | Vercel preview, password-protected | Supabase branch of civic; the vault uses a shared `vault-dev` project | Meta test number | Seed data only, never production |
| Production | Vercel production + police Worker | `civic-prod`, `vault-prod` | Verified business number | Real; access as in the security section |

> *Diagram: commit to production · 8 steps, GitHub Actions. It is only in the live doc (link in [README](README.md)).*

**Pipeline details (GitHub Actions)**

- **On every PR:** ESLint (including the import-boundary rule for police code), `tsc`, Vitest unit tests (bot state machine, scorecard maths, aggregation rules), `supabase db lint`, and a migration dry run on the preview branch. Playwright end-to-end tests then run against the Vercel preview URL.
- **On merge to `main`:** a release workflow with a manual approval step. It runs `supabase db push` to civic-prod and vault-prod, then `wrangler deploy` for the Worker, then promotes the Vercel build. Smoke tests run against production; a failure triggers Vercel rollback and an alert.
- **Migrations:** forward-only and backwards-compatible (expand, then contract), so the previous app version keeps working if the deploy rolls back. Destructive changes ship in a later release.
- **Secrets:** stored in GitHub environments (`preview`, `production`); the production environment requires approval. No production keys are on your laptop.
- **Dependencies:** Renovate weekly, with automatic merge for patch updates once CI passes; `pnpm audit` in CI.

## Observability, backups and recovery

Targets for a volunteer-run v1:

- **Uptime:** 99.5% a month for reporting
- **RPO:** 24 hours of data loss at most
- **RTO:** back up within 4 hours

Alerts go to one Telegram channel (or email) that you and one backup person watch.

**Monitoring (civic zone only; the police Worker emits nothing)**

| Signal | Tool | Alert when |
| --- | --- | --- |
| App errors | Sentry (web + Edge Functions), PII scrubbing on | New error type, or more than 20 events in 10 minutes |
| Uptime | Better Stack or UptimeRobot: home page, `/api/health`, WhatsApp webhook | Down for 2 checks in a row |
| Police form up? | Same uptime tool, GET of the static form only (no submissions) | Down for 2 checks |
| Queue health | `/api/health` reports queue depth and oldest message age | `wa_inbound` older than 2 minutes, or any dead letters |
| Moderation backlog | Daily SQL check | More than 50 unverified, or the oldest over 48 hours |
| Costs | Billing alerts on Supabase, Vercel, Anthropic, Meta | Spend 80% of the monthly budget |
| Product metrics | Plausible (no cookies) + scorecard SQL | Weekly review, no alert |

**Backups**

- Supabase Pro daily backups, kept 7 days, for both projects.
- Your own nightly `pg_dump` of the civic DB: encrypted with `age`, stored in Cloudflare R2 for 30 days (GitHub Action).
- Vault backups: Supabase built-in only, no extra copies. Fewer copies means less exposure; the 12-month retention still applies.
- **Restore drill once a quarter:** restore the latest dump into a scratch project and run the smoke tests.

**Runbooks to write before launch (one page each)**

1. WhatsApp number restricted or token expired
2. Supabase outage: switch the site to read-only cached mode, keep WhatsApp drafts in the queue
3. Suspected breach of the civic DB: rotate keys, assess, notify NDPC within 72 hours
4. Suspected vault exposure: take police intake offline, preserve evidence, contact the legal partner
5. Legal demand or takedown request: who decides, what's logged, the legal partner's contact
6. Bad deploy: Vercel instant rollback, plus the migration rollback steps

## Production readiness checklist

Go live only when every box in a group is ticked. The police group can stay open: the civic launch goes ahead with police intake switched off by a feature flag.

**Accounts and infrastructure (week 1)**

- [ ] Domain registered; DNS on Cloudflare; email authentication set up (SPF, DKIM, DMARC) for the Resend sending domain
- [ ] Supabase org on Pro: `civic-prod` and `vault-prod` projects (EU region), PITR decision recorded
- [ ] Vercel project linked to GitHub; production domain + HTTPS; preview deploys protected by password
- [ ] Meta Business verified; WhatsApp Business number registered on the Cloud API; display name approved; templates submitted
- [ ] Cloudflare Worker + R2 bucket created; Turnstile site key
- [ ] Sentry, uptime monitor and billing alerts in place

**Data and content**

- [ ] GRID3 LGA and ward boundaries for Lagos and FCT loaded and spot-checked against 20 known addresses
- [ ] Agency directory seeded: about 15 agencies per city with verified emails and social handles
- [ ] Privacy notice, terms, methodology and content rules published
- [ ] Pidgin strings reviewed by a native speaker

**Quality gates**

- [ ] End-to-end tests (Playwright) pass for: web report, WhatsApp bot (mocked), moderation verify + route, agency response, citizen confirmation
- [ ] Lighthouse on a mid-range Android profile: report flow scores 85 or more for performance; first load under 200 KB of JavaScript
- [ ] Load test: 50 reports a minute and a 500-message WhatsApp burst with no lost messages
- [ ] Restore drill completed once

**Police intake gate**

- [ ] Independent security review of the Worker and vault (a volunteer security professional is fine, but not you)
- [ ] Verified: no IP, user agent or cookie appears in any log, database row or response
- [ ] Legal review signed off; legal-aid partner confirmed
- [ ] Two police moderators trained; access logging tested

**Go-live day**

1. Freeze merges; tag the release.
2. Run production migrations from CI; check the schema diff is empty.
3. Promote the tagged build in Vercel; run smoke tests against production.
4. Switch WhatsApp templates and the webhook to production; send a test report end to end.
5. Turn on the `lagos` city flag, then `fct` a week later.
6. Watch the dashboards for 48 hours; the rollback owner is on call.

## Scaling path and decisions to revisit

This architecture comfortably handles the pilot (about 1,000 reports a month) and should reach about 50,000 a month across many states without a redesign. The table shows what to change at each step, and when.

| Stage | Trigger | Change |
| --- | --- | --- |
| Pilot | Launch | As designed: about $50–75 a month (adds the second Supabase project and Upstash to the PRD estimate) |
| Growth | Over 10k reports a month, or more states | Upgrade Supabase compute; add read replicas for public pages; turn on PITR; move media to Cloudflare R2 + Images to cut egress costs |
| Partners | Agencies want logins (v2 agency dashboard) | Add the `(agency)` authenticated area with per-agency RLS; keep the token links for agencies that don't sign up |
| Corruption (v2) | Launch of corruption reporting | Treat like police: route it through the vault, or a second vault with its own moderators |
| USSD / SMS (v2) | Grant or telco partner | Add an aggregator webhook (e.g. Africa's Talking) feeding the same `wa_inbound`-style queue and bot state machine |
| Heavy load | Queue lag over 5 minutes or Edge Function limits | Move workers to a dedicated service (Fly.io or Cloud Run) still reading pgmq; the app is unchanged |

**Decisions to revisit**

- [ ] **Hosting region:** move to an African region (or Nigerian hosting) if NDPC guidance or partners require data residency
- [ ] **Vercel plan:** Hobby is for non-commercial use only; move to Pro ($20 a month) if you take grants or revenue
- [ ] **Cloudflare edge logging:** Workers logs off doesn't cover Cloudflare's own infrastructure logs. Get legal advice on whether a Tor onion address or a no-log host is needed for the highest-risk reporters
- [ ] **Speech-to-text vendor:** compare Whisper with a Nigerian-language model on 50 real Pidgin and Hausa voice notes before launch
- [ ] **AI on police reports:** stays off in v1; revisit only with a self-hosted model inside the vault
