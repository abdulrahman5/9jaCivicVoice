# Decisions log

Changes made while building that differ from the architecture doc (19 Oct 2026). Newest first.

| Date | Decision | Why | Update the architecture doc? |
| --- | --- | --- | --- |
| 2026-10-19 | Phone numbers are stored **encrypted** (AES-256-GCM, key outside the database) as well as hashed, and both are cleared 90 days after the issue closes. | The doc said numbers exist "only as a salted hash", but a hash can't be messaged: status updates on WhatsApp need the number. Encryption with an external key keeps a database dump useless on its own. | Yes: Data architecture, Security sections |
| 2026-10-19 | Queue workers run as a Next.js route (`POST /api/jobs/run`), called by pg_cron via pg_net, instead of Supabase Edge Functions. | The bot state machine, validation and i18n are TypeScript workspace packages. Running workers in the same app reuses them directly, rather than duplicating them for Deno. pgmq, pg_cron and retries are unchanged. Revisit if jobs outgrow Vercel's function limits. | Yes: D4, Async processing |
| 2026-10-19 | The police database uses the schema name `police`, not `vault`. | Every Supabase project already has a `vault` schema (its built-in secrets store), and the bridge jobs use it. | Yes: Data architecture |
| 2026-10-19 | Database projects live in `db/civic` and `db/vault`, not `supabase/civic`. | The Supabase CLI expects a `supabase/` folder inside each workdir. | Yes: Codebase structure |
| 2026-10-19 | WhatsApp reports get subcategory `other`; a typed (not shared) location is stored as text, with `location` null until a moderator places it. The bot asks for the city only when no pin is shared. | Keeps the WhatsApp conversation to four short steps. | No |
| 2026-10-19 | Status codes for police reports are hashed with PBKDF2-SHA256 (100k iterations), not Argon2id. | Argon2 needs WASM in Workers; PBKDF2 is in WebCrypto. Codes are rate-limited at the edge. **Move to Argon2id before launch.** | No (tracked in README "Next up") |
| 2026-10-19 | Fonts use the system stack; Public Sans will be self-hosted via `next/font/local`. | Loading Google Fonts would send every visitor's IP to Google. | No |
