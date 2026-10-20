# 9jaCivicVoice

9ja Civic Voice. A place for the everyday citizen to participate and be active in the civic process, and see the impacts of their voices being heard.

Citizens in Lagos and FCT Abuja report failures in public services (roads, power, water, health, public offices) and police misconduct. The reports feed a public scorecard of how agencies respond. The project is an independent watchdog: it holds agencies to account and gives public credit when things get fixed.

Planning docs: v1 PRD, system architecture, and the wireframe canvas (shared separately).

## Repository layout

```text
apps/
  web/              Next.js app (Vercel): PWA report flow, public site, scorecard,
                    moderation console, agency response pages, WhatsApp webhook, job runner
  police-intake/    Cloudflare Worker: the protected police report form (police vault zone)
packages/
  validation/       zod schemas, taxonomy, status model (shared by everything)
  db/               civic database client (server-only)
  vault-db/         police vault client (server-only; admin area only, enforced by ESLint)
  i18n/             English + Pidgin strings (Hausa, Yorùbá, Igbo fall back to English)
  media/            on-device image processing: resize, blur, EXIF strip
  shared-ui/        design tokens from the wireframes
db/
  civic/supabase/   civic database: migrations, seed, config
  vault/supabase/   police vault database: migrations, config
.github/workflows/  CI, release (production deploy), nightly backup
```

There are two trust zones, and the separation between them is a security control:

- **Civic:** `apps/web` plus the civic database.
- **Police vault:** `apps/police-intake` plus the vault database.

The police Worker can't import the civic database client, and only `apps/web/app/(admin)` can import the vault client; ESLint fails the build if either rule is broken. The only data that moves from the vault to civic is a nightly push of ~1 km grid aggregates.

## Getting started

Requirements: Node 22, pnpm 10, Docker (for local Supabase).

```bash
pnpm install

# Start both local databases (applies migrations and seed data)
pnpm db:civic:start      # API on :54321, Postgres on :54322
pnpm db:vault:start      # API on :55321, Postgres on :55322

# Web app
cp apps/web/.env.example apps/web/.env.local   # fill in keys printed by db:civic:start
pnpm dev                                       # http://localhost:3000

# Police intake Worker
cp apps/police-intake/.dev.vars.example apps/police-intake/.dev.vars
pnpm dev:police                                # http://localhost:8787
```

To generate secrets:

```bash
openssl rand -base64 48   # CONTACT_HASH_PEPPER, AGENCY_TOKEN_KEY
openssl rand -base64 32   # CONTACT_ENC_KEY (must be exactly 32 bytes)
openssl rand -hex 32      # JOBS_SECRET, STATUS_CODE_PEPPER

# Officer-details key pair: the public key goes to the Worker, the private key to the web app's admin env only
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out officer.pem
openssl rsa -in officer.pem -pubout -outform DER | base64 -w0                    # OFFICER_DETAILS_PUBLIC_KEY
openssl pkcs8 -topk8 -nocrypt -in officer.pem -outform DER | base64 -w0         # OFFICER_DETAILS_PRIVATE_KEY
```

Keep `officer.pem` offline. Anyone who has it can read officer details.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm check` | Lint, typecheck and test everything (the same as CI) |
| `pnpm test` | Unit tests (Vitest) in every package |
| `pnpm db:civic:reset` | Rebuild the local civic database from migrations + seed |
| `pnpm db:civic:test` | Database tests (pgTAP) for the moderation functions |
| `pnpm db:vault:test` | Database tests (pgTAP) for the police vault functions |
| `pnpm --filter @civicvoice/web staff:create <email> "<name>" <role>` | Create a staff account (roles: `moderator`, `admin`, `police_moderator`); prints a one-time password |
| `pnpm db:types` | Regenerate `packages/db/src/database.types.ts` from the local civic schema |

## How a report flows

1. **Web:** `POST /api/reports` → `core.submit_report()` creates the issue, report and "received" event, fills LGA/ward from boundaries, and enqueues triage.
2. **WhatsApp:** Meta → `POST /api/whatsapp/webhook` (signature checked) → `wa_inbound` queue → `POST /api/jobs/run` (called each minute by pg_cron) → bot state machine → same `core.submit_report()`.
3. **Moderation:** staff sign in at `/login` (password, then an authenticator code; set up on first sign-in). In `/admin` they edit, merge, reject, or verify and route each report through SQL functions that re-check state and write the audit log. A routed issue gets a signed, no-login agency link (`/r/[token]`), which the moderator emails to the agency until the `forward_agency` email job lands.
4. **Updates:** every status change goes through `core.change_status()`, which checks the transition, writes the event and the audit log, and enqueues `notify_citizen`.
5. **Scorecard:** `public_read.scorecard` is rebuilt nightly. The public site reads only the `public_read` schema, using the anon key.

## Preview deployment

To get a shareable test URL (Vercel + a Supabase preview project, with fake demo data, a preview build for every pull request), follow [docs/PREVIEW.md](docs/PREVIEW.md).

The PRD, architecture and wireframes from the planning phase are in [docs/planning](docs/planning/README.md). The police reporting spec is [docs/POLICE.md](docs/POLICE.md).

## Production setup (one time)

See the architecture doc's production readiness checklist. In short:

1. Create two Supabase projects, `civic-prod` and `vault-prod`, and run `supabase db push` for each (the release workflow does this).
2. In the **civic** project's Supabase Vault (its secrets store):
   - `worker_url` = `https://<site>/api/jobs/run`
   - `worker_key` = `JOBS_SECRET`
   - `police_bridge_secret` = a random value
3. In the **vault** project's Supabase Vault:
   - `civic_rest_url` = `https://<civic-ref>.supabase.co/rest/v1`
   - `civic_anon_key`
   - `police_bridge_secret` = the same random value
4. Create a Cloudflare Worker route for the police form, plus a WAF rate-limit rule on it. Set the Worker secrets with `wrangler secret put`.
5. Create a Vercel project for `apps/web` with the production env vars, and the GitHub `production` environment (with required reviewers) holding the secrets that `release.yml` lists.
6. Load real GRID3 LGA and ward boundaries for Lagos and FCT into `core.lgas` and `core.wards`. The seed only has fake boxes.

## Status

**Done and tested:**
- Monorepo, shared validation, i18n, media helpers.
- Web report flow, tracking, public pages, scorecard.
- WhatsApp webhook, bot state machine and job runner.
- Agency response page.
- Staff sign-in with required authenticator codes (TOTP); moderation console with edit, merge, reject, verify and route.
- Police intake Worker with encryption and grid privacy.
- Both database schemas with RLS, queues, cron, retention.
- CI, release and backup workflows.

**Next up:**
- Media upload via signed URLs, and moderator photo approval.
- Job handlers for `media_fetch`, `transcribe`, `triage` (Claude Haiku), `notify_citizen`, `forward_agency` and `publish_media`.
- Duplicate check in the web flow.
- Map and Wins pages.
- Police status-check page.
- Sentry.

See [docs/DECISIONS.md](docs/DECISIONS.md) for where the code departs from the architecture doc, and why.
