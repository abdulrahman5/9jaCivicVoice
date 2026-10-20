import { PoliceSubmission, ReporterMessage, StatusCode } from "@civicvoice/validation";
import { generateStatusCode, hashStatusCode, importPublicKey, seal, statusLookup, unb64 } from "./crypto";
import { FORM_HTML, FORM_JS, SHARED_CSS, STATUS_HTML, STATUS_JS, withSiteKey } from "./form";
import { MAX_PHOTO_BYTES, stripJpegMetadata } from "./jpeg";
import { gridCell } from "./privacy";
import { verifyTurnstile } from "./turnstile";

/**
 * Police intake Worker (wireframe 4.1, PRD F5, docs/POLICE.md).
 *
 * Privacy rules this file must keep:
 * - never read identifying headers (see IDENTIFYING_HEADERS in privacy.ts)
 * - never log: no logging calls anywhere in this app
 * - never set cookies
 * - store a ~1 km grid cell, never exact coordinates
 * - status codes travel only in request bodies, never in URLs
 */

export interface Env {
  VAULT_SUPABASE_URL: string;
  VAULT_SUPABASE_ANON_KEY: string;
  OFFICER_DETAILS_PUBLIC_KEY: string;
  STATUS_CODE_PEPPER: string;
  STATUS_LOOKUP_KEY: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  PUBLIC_SITE_URL: string;
}

// Turnstile is the one outside script: Cloudflare's own, from the same provider that hosts this Worker.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    `script-src 'self' ${TURNSTILE_ORIGIN}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Permissions-Policy": "geolocation=(self), camera=(self)",
  "X-Robots-Tag": "noindex",
};

function respond(body: BodyInit, contentType: string, status = 200): Response {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, "Content-Type": contentType } });
}

const json = (data: unknown, status = 200) => respond(JSON.stringify(data), "application/json", status);

const NOT_FOUND = "We couldn't find a report with that code. Check the words and try again.";
const UNAVAILABLE = "Something went wrong on our side. Please try again in a few minutes.";
const BOT_CHECK = "Please complete the security check and try again.";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET") {
      const html = "text/html; charset=utf-8";
      if (url.pathname === "/") return respond(withSiteKey(FORM_HTML, env.TURNSTILE_SITE_KEY), html);
      if (url.pathname === "/status") return respond(withSiteKey(STATUS_HTML, env.TURNSTILE_SITE_KEY), html);
      if (url.pathname === "/app.js") return respond(FORM_JS, "text/javascript; charset=utf-8");
      if (url.pathname === "/status.js") return respond(STATUS_JS, "text/javascript; charset=utf-8");
      if (url.pathname === "/app.css") return respond(SHARED_CSS, "text/css; charset=utf-8");
      return respond("Not found", "text/plain", 404);
    }

    if (request.method === "POST") {
      if (url.pathname === "/api/submit") return handleSubmit(request, env);
      if (url.pathname === "/api/status") return handleStatus(request, env);
      if (url.pathname === "/api/message") return handleMessage(request, env);
    }

    return respond("Method not allowed", "text/plain", 405);
  },
};

/** Reads a JSON object body, or returns the error response to send. */
async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Expected JSON" }, 415);
  }
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  return json({ error: "Invalid JSON" }, 400);
}

/** Calls a police.* function in the vault with the Worker's (anon) key. */
function rpc(env: Env, fetchImpl: typeof fetch, name: string, args: Record<string, unknown>) {
  return fetchImpl(`${env.VAULT_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: env.VAULT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.VAULT_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": "police",
      "Accept-Profile": "police",
    },
    body: JSON.stringify(args),
  });
}

const MAX_PHOTOS = 3;

/**
 * Reads a submission: JSON, or multipart/form-data with the report as JSON in a "report"
 * field and up to three JPEG "photos". Photos are metadata-stripped here; nothing is stored yet.
 */
async function readSubmission(request: Request): Promise<{ fields: Record<string, unknown>; photos: Uint8Array[] } | Response> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    const body = await readJson(request);
    return body instanceof Response ? body : { fields: body, photos: [] };
  }
  let form: FormData;
  let fields: unknown;
  try {
    form = await request.formData();
    fields = JSON.parse(String(form.get("report") ?? ""));
  } catch {
    return json({ error: "Invalid form data" }, 400);
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return json({ error: "Invalid form data" }, 400);

  const files = form.getAll("photos");
  if (files.length > MAX_PHOTOS) return json({ error: `Add at most ${MAX_PHOTOS} photos.` }, 422);
  const photos: Uint8Array[] = [];
  for (const file of files) {
    if (typeof file === "string" || file.size > MAX_PHOTO_BYTES) {
      return json({ error: "A photo is too large. Remove it and try again." }, 422);
    }
    const stripped = stripJpegMetadata(new Uint8Array(await file.arrayBuffer()));
    if (!stripped) return json({ error: "A photo couldn't be read. Remove it and try again." }, 422);
    photos.push(stripped);
  }
  return { fields: fields as Record<string, unknown>, photos };
}

/** Stores one photo in the vault's private bucket. The anon key can add objects, never read them. */
async function storePhoto(env: Env, fetchImpl: typeof fetch, bytes: Uint8Array): Promise<string | null> {
  const key = `${crypto.randomUUID()}.jpg`;
  const res = await fetchImpl(`${env.VAULT_SUPABASE_URL}/storage/v1/object/police-media/${key}`, {
    method: "POST",
    headers: {
      apikey: env.VAULT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.VAULT_SUPABASE_ANON_KEY}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "false",
    },
    body: bytes,
  });
  return res.ok ? key : null;
}

export async function handleSubmit(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const submission = await readSubmission(request);
  if (submission instanceof Response) return submission;
  const { turnstileToken, ...fields } = submission.fields;

  // Photo keys come only from photos stored here, never from the client.
  if ("mediaKeys" in fields) return json({ error: "Please check the form and try again." }, 422);
  const parsed = PoliceSubmission.safeParse(fields);
  if (!parsed.success) return json({ error: "Please check the form and try again." }, 422);
  if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, fetchImpl))) {
    return json({ error: BOT_CHECK }, 403);
  }
  const report = parsed.data;

  const mediaKeys: string[] = [];
  for (const photo of submission.photos) {
    const key = await storePhoto(env, fetchImpl, photo);
    if (!key) return json({ error: "We couldn't save your photos. Please try again in a few minutes." }, 502);
    mediaKeys.push(key);
  }

  const officerDetails = report.officerDetails
    ? JSON.stringify(await seal(report.officerDetails, await importPublicKey(env.OFFICER_DETAILS_PUBLIC_KEY)))
    : null;

  const statusCode = generateStatusCode();
  const { salt, hash } = await hashStatusCode(statusCode, env.STATUS_CODE_PEPPER);

  // police.submit_report is SECURITY DEFINER; the anon key can't touch the tables directly.
  const res = await rpc(env, fetchImpl, "submit_report", {
    p_city: report.city,
    p_incident_type: report.incidentType,
    p_place: report.place,
    p_grid_cell: report.lat !== undefined && report.lng !== undefined ? gridCell(report.lat, report.lng) : null,
    p_when: report.when,
    p_occurred_on: report.occurredOn ?? null,
    p_description: report.description,
    p_officer_details_sealed: officerDetails,
    p_media_keys: mediaKeys,
    p_consent_to_forward: report.consentToForward,
    p_wants_legal_aid: report.wantsLegalAid,
    p_status_code_salt: salt,
    p_status_code_hash: hash,
    p_kind: report.kind,
    p_time_of_day: report.timeOfDay ?? null,
    p_status_lookup: await statusLookup(statusCode, env.STATUS_LOOKUP_KEY),
  });

  if (!res.ok) return json({ error: "We couldn't save your report. Please try again in a few minutes." }, 502);
  return json({ statusCode }, 201);
}

/**
 * Turns a normalised code into the two values the vault checks: the lookup, and the
 * salted hash (using that report's salt). Returns null when no report has this code.
 */
async function credentials(code: string, env: Env, fetchImpl: typeof fetch) {
  const lookup = await statusLookup(code, env.STATUS_LOOKUP_KEY);
  const res = await rpc(env, fetchImpl, "code_salt", { p_lookup: lookup });
  if (!res.ok) throw new Error("vault unavailable");
  const salt = (await res.json()) as string | null;
  if (!salt) return null;
  const { hash } = await hashStatusCode(code, env.STATUS_CODE_PEPPER, unb64(salt));
  return { lookup, hash };
}

export async function handleStatus(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const code = StatusCode.safeParse(body.code);
  if (!code.success) return json({ error: "Enter all six words of your code." }, 422);

  try {
    const creds = await credentials(code.data, env, fetchImpl);
    if (!creds) return json({ error: NOT_FOUND }, 404);
    const res = await rpc(env, fetchImpl, "thread", { p_lookup: creds.lookup, p_code_hash: creds.hash });
    if (!res.ok) return json({ error: UNAVAILABLE }, 502);
    const thread: unknown = await res.json();
    if (!thread) return json({ error: NOT_FOUND }, 404);
    return json(thread);
  } catch {
    return json({ error: UNAVAILABLE }, 502);
  }
}

export async function handleMessage(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const { turnstileToken, ...fields } = body;

  const parsed = ReporterMessage.safeParse(fields);
  if (!parsed.success) return json({ error: "Write a message of up to 1,000 characters." }, 422);
  if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, fetchImpl))) {
    return json({ error: BOT_CHECK }, 403);
  }

  try {
    const creds = await credentials(parsed.data.code, env, fetchImpl);
    if (!creds) return json({ error: NOT_FOUND }, 404);
    const res = await rpc(env, fetchImpl, "post_message", {
      p_lookup: creds.lookup,
      p_code_hash: creds.hash,
      p_body: parsed.data.body,
    });
    if (res.ok) return json({ ok: true }, 201);

    // police.post_message raises these; PostgREST returns them as { code, message }.
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    if (err.message === "daily message limit reached") {
      return json({ error: "You've sent 5 messages today. You can send more tomorrow." }, 429);
    }
    if (err.message === "this report is closed") {
      return json({ error: "This report is closed, so it can't take new messages." }, 409);
    }
    if (err.message === "no report for this code") return json({ error: NOT_FOUND }, 404);
    return json({ error: UNAVAILABLE }, 502);
  } catch {
    return json({ error: UNAVAILABLE }, 502);
  }
}
