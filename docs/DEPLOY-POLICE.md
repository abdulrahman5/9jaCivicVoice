# Deploying the police stack

The police stack is the protected police form (a Cloudflare Worker) and the police vault database (its own Supabase project). It deploys separately from the web app, with the **Police deploy** workflow in GitHub Actions.

Do **preview** first. It uses fake data and Cloudflare's Turnstile test keys, and lets you try the whole loop: file a report, moderate it in the console, check its status with the code.

**Production is blocked by design.** The workflow refuses to deploy it until the launch gate in [POLICE.md](POLICE.md) has passed:
- an independent security review
- a check that no identifying data reaches logs or rows
- a legal review
- two trained police moderators

Once those are done, you set `POLICE_LAUNCH_GATE_PASSED`.

You need: the preview web app already running ([PREVIEW.md](PREVIEW.md)), a Cloudflare account, and `openssl` on your computer.

## 1. Generate the secrets (on your computer)

```sh
scripts/police-secrets.sh preview
```

This writes one file per value to `.police-secrets/preview/`. That folder is git-ignored and readable only by you.

**Keep `officer.pem` offline** (on a USB stick or paper). Without it, stored officer details can never be read. The script refuses to overwrite existing secrets, because replacing them breaks every status code already issued.

Copy values from the files rather than printing them. For example, on macOS: `pbcopy < .police-secrets/preview/STATUS_LOOKUP_KEY`.

## 2. Supabase: create the police vault project

1. Create a project called `civicvoice-police-preview`, in the same region as your civic project. Save the database password.
2. Open **Project Settings → Data API → Exposed schemas**, add `police`, and save. The Worker and the console both call the `police` schema through the API.

   Exposing the schema grants nothing by itself. The Worker's anon key can only call four functions, and only the service role can read reports.
3. Leave public sign-up off (**Authentication → Sign In / Providers**). Nobody signs in to this project.
4. Collect these values:

   | Value | Where to find it |
   | --- | --- |
   | Project URL | Project Settings → Data API |
   | anon / publishable key | Project Settings → API Keys |
   | service_role / secret key | Project Settings → API Keys |
   | Session pooler connection string | **Connect** button → Session pooler, with your password filled in |

You also need from the **civic preview** project: its Project URL, its anon key, and its Session pooler connection string. These are the same values as `PREVIEW_DB_URL` in PREVIEW.md.

## 3. Cloudflare

1. **Account ID:** shown in the dashboard sidebar under Workers & Pages.
2. **workers.dev subdomain:** Workers & Pages → your subdomain. Preview deploys to `civicvoice-police-intake-preview.<subdomain>.workers.dev`.
3. **API token:** My Profile → API Tokens → Create Token → the "Edit Cloudflare Workers" template, limited to your account.
4. **Turnstile:** for preview, use Cloudflare's test keys, which always pass:
   - site key `1x00000000000000000000AA`
   - secret `1x0000000000000000000000000000000AA`

## 4. GitHub: the `police-preview` environment

In **Settings → Environments → New environment**, create `police-preview` and add:

**Variables**

| Name | Value |
| --- | --- |
| `VAULT_SUPABASE_URL` | the police vault Project URL |
| `CIVIC_SUPABASE_URL` | the civic preview Project URL |
| `PUBLIC_SITE_URL` | your preview web app's address |
| `TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` |
| `CLOUDFLARE_ACCOUNT_ID` | your account ID |

**Secrets**

| Name | Value |
| --- | --- |
| `VAULT_DB_URL` | police vault Session pooler string |
| `CIVIC_DB_URL` | civic preview Session pooler string |
| `VAULT_SUPABASE_ANON_KEY` | police vault anon key |
| `VAULT_SERVICE_ROLE_KEY` | police vault service_role key |
| `CIVIC_ANON_KEY` | civic preview anon key |
| `CLOUDFLARE_API_TOKEN` | the API token |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` |
| `OFFICER_DETAILS_PUBLIC_KEY` | from `.police-secrets/preview/` |
| `STATUS_CODE_PEPPER` | from `.police-secrets/preview/` |
| `STATUS_LOOKUP_KEY` | from `.police-secrets/preview/` |
| `POLICE_BRIDGE_SECRET` | from `.police-secrets/preview/` |

## 5. Deploy

Go to **Actions → Police deploy → Run workflow → preview**. The workflow:
1. Runs the Worker's tests.
2. Applies the police vault migrations, including the private photo bucket and the nightly jobs.
3. Sets the vault's secrets for the patterns bridge and photo deletion, and the civic project's bridge secret.
4. Deploys the Worker and sets its secrets. Nothing is printed.
5. Runs a smoke test that stores nothing. It checks:
   - the pages and their privacy headers
   - that the Worker reaches the vault (an unknown code is "not found")
   - that a report without a Turnstile token is refused

The run's summary shows the form's address. Re-run the workflow whenever police code or migrations change.

## 6. Connect the preview web app

1. In Vercel, add these to the **Preview** environment:

   | Name | Value |
   | --- | --- |
   | `VAULT_SUPABASE_URL` | police vault Project URL |
   | `VAULT_SUPABASE_SERVICE_ROLE_KEY` | police vault service_role key |
   | `OFFICER_DETAILS_PRIVATE_KEY` | from `.police-secrets/preview/` (only here, never in GitHub) |
   | `NEXT_PUBLIC_POLICE_FORM_URL` | the form address from the workflow summary |

   Then redeploy.
2. In the `preview` GitHub environment (the one from PREVIEW.md), add the variable `DEMO_POLICE_STAFF_EMAIL`. Re-run **Preview database**. This creates a police moderator with the demo password.

## 7. Try it

1. Open the form (the home page's Police conduct tile) and file a report with a test photo. Write down the six-word code.
2. Sign in to `/admin` as the police moderator, and open **Police reports**:
   - mark the report consistent
   - write the redacted copy
   - record a forward
   - reply to the reporter
3. Back on the form's `/status` page, enter the code. You should see the status, the forward and the reply.
4. After the month ends, `/police` shows that month's patterns (areas with 3 or more reports).

## Production

Same steps, with these differences:

- **Launch gate first.** Set the repo variable `POLICE_LAUNCH_GATE_PASSED=true` only once every item in the gate is done.
- **New secrets:** run `scripts/police-secrets.sh production`. Never reuse preview values.
- **New projects:** `civicvoice-police` for the vault, and the production civic project.
- **Your own domain on Cloudflare,** e.g. `report.yourdomain.org`, set as the `POLICE_FORM_DOMAIN` variable.
  - Add a proxied DNS record for it, e.g. type `AAAA`, value `100::`, proxied, so the Worker route has something to attach to.
  - The API token also needs **Zone → Workers Routes: Edit** for that zone.
- **A rate-limit rule** (Security → WAF → Rate limiting rules), because the Worker never reads IP addresses itself:
  - when the hostname equals your form domain and the URI path starts with `/api/`
  - count by IP
  - **10 requests per 10 seconds**, then block for 10 seconds (the free plan's limits; on paid plans, prefer about 20 per minute with a longer block)
- **A real Turnstile widget** for your form domain, with its site key and secret.
- **A `police-production` GitHub environment** with required reviewers.
- **Vercel's Production environment:** the vault URL and service key, `OFFICER_DETAILS_PRIVATE_KEY`, and `NEXT_PUBLIC_POLICE_FORM_URL`.
- **No demo moderators.** Create the two police moderators with `staff:create ... police_moderator`, each on their own device.

Before linking the form publicly, run through section 7 on production with one test report, then delete it. Also check in the Cloudflare dashboard that **Workers Logs** and **Logpush** are off for the Worker.
