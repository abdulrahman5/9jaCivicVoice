# Preview deployment

A shareable test URL running the real app on a hosted database with fake demo data. Once it's set up, Vercel builds a fresh preview for every pull request and posts the link on the PR.

It takes about 20 minutes, all in web dashboards, with three free accounts: **Supabase** (database), **GitHub** (this repo) and **Vercel** (hosting).

> The preview is for looking around, not for real reports. Its data is invented, and it uses Cloudflare's Turnstile **test** keys, which let everything through, so there's no bot protection.

## 1. Supabase: create the preview database

1. At [supabase.com/dashboard](https://supabase.com/dashboard), create a project called `civicvoice-preview`. Choose the region nearest Nigeria (e.g. London or Frankfurt). Save the database password somewhere safe.
2. **Create and expose the app's schemas.** The "Exposed schemas" list only offers schemas that already exist, so create them first; the workflow fills them in later.
   - **SQL Editor → New query**, paste and **Run**:
     ```sql
     create schema if not exists core;
     create schema if not exists ops;
     create schema if not exists public_read;
     ```
   - **Project Settings → Data API** (or **Integrations → Data API → Settings**) → **Exposed schemas**: tick `core`, `ops` and `public_read`, keep `public` and `graphql_public`, then **Save**. Refresh the page if the new schemas aren't listed.

   Exposing a schema doesn't grant access: the migrations give the public (anon) key no permissions in `core` or `ops`, so only the server's service-role key can use them.
3. **Authentication → Sign In / Providers:**
   - Turn **off** "Allow new users to sign up". Staff accounts are created by the workflow below.
   - Leave the **Email** provider **on**. Turning it off blocks staff sign-in.

   Authenticator-app (TOTP) two-factor is on by default.
4. Collect these values:

   | Value | Where to find it |
   | --- | --- |
   | Project URL | Project Settings → Data API (`https://<ref>.supabase.co`) |
   | anon / publishable key | Project Settings → API Keys |
   | service_role / secret key | Project Settings → API Keys (keep it secret: it bypasses all access rules) |
   | Session pooler connection string | **Connect** button → Session pooler. Use this one, not "Direct connection": GitHub's runners can't reach the direct address. Put your database password into it. |

## 2. GitHub: load the schema and demo data

1. In the repo: **Settings → Environments → New environment**, name it `preview`.
2. Add these **secrets** to the `preview` environment:

   | Secret | Value |
   | --- | --- |
   | `PREVIEW_DB_URL` | the Session pooler connection string |
   | `PREVIEW_SERVICE_ROLE_KEY` | the service_role / secret key |
   | `DEMO_STAFF_PASSWORD` | a password for the demo moderator, 12+ characters |

3. Add these **variables** to the `preview` environment:

   | Variable | Value |
   | --- | --- |
   | `PREVIEW_SUPABASE_URL` | the Project URL |
   | `DEMO_STAFF_EMAIL` | the demo moderator's email, e.g. `demo@yourdomain.com` |

4. **Actions → Preview database → Run workflow.** It applies the migrations, loads the sample agencies, boundaries and demo reports (first run only), and creates the demo moderator. It never prints a secret. Run it again whenever new migrations are merged.

## 3. Vercel: host the app

1. At [vercel.com/new](https://vercel.com/new), import `abdulrahman5/9jaCivicVoice`.
2. Set **Root Directory** to `apps/web`. The framework (Next.js) and install command come from `apps/web/vercel.json`.
3. Under **Environment Variables**, add the following, scoped to **Preview** (and Production too, if you want the `main` branch deployed with the same demo setup):

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
   | `CONTACT_HASH_PEPPER` | 48+ random characters: `openssl rand -base64 48` |
   | `CONTACT_ENC_KEY` | exactly 32 random bytes, base64: `openssl rand -base64 32` |
   | `AGENCY_TOKEN_KEY` | 48+ random characters: `openssl rand -base64 48` |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (Cloudflare test key) |
   | `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` (Cloudflare test key) |

   Don't set `NEXT_PUBLIC_SITE_URL`: each preview works out its own address. Use preview-only values for the three secrets, never the ones you'll use in production.
4. Click **Deploy**. When it finishes, open the URL.
5. Previews are visible only to members of your Vercel team by default (**Settings → Deployment Protection → Vercel Authentication**). To show someone outside the team, create a shareable link from the deployment's page, or turn protection off for previews.

## 4. Try it

- **Citizen side:** open the URL on your phone. Browse the demo issues, submit a report, then track it.
- **Scorecard:** `/scorecard`.
- **Staff side:** go to `/login` and sign in with `DEMO_STAFF_EMAIL` and `DEMO_STAFF_PASSWORD`. Scan the QR code with an authenticator app, then verify, merge, reject and route the waiting reports. After routing an issue, **Create agency link** and open it in a private window to reply as the agency.

## Not in the preview yet

- **Police intake form:** shows as "Coming soon". It needs the separate vault database and a Cloudflare Worker.
- **WhatsApp bot:** needs a Meta business number.
- **Agency emails, AI triage, voice-note transcription and the queue worker.**

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Pages show no issues; logs mention `Invalid schema` or `permission denied for schema core` | Step 1.2: expose `core`, `ops`, `public_read` |
| Workflow fails at "Create or refresh the demo moderator" with `Invalid schema: ops` | Step 1.2 wasn't done before the run: expose the schemas, then re-run the workflow |
| Workflow fails at "Apply migrations" with a network or timeout error | Use the **Session pooler** connection string, not the direct one |
| Workflow fails at "Check configuration" | A secret or variable is missing from the `preview` **environment** (not repo-level) |
| Staff sign-in says the email and password don't match | Re-run the workflow to reset the password; check the Email provider is on |
| "Verification failed" when submitting a report | Both Turnstile variables must be set in Vercel, then redeploy |
