import { PoliceSubmission } from "@civicvoice/validation";
import { generateStatusCode, hashStatusCode, importPublicKey, seal } from "./crypto";
import { FORM_HTML, FORM_JS, FORM_CSS } from "./form";
import { gridCell } from "./privacy";

/**
 * Police intake Worker (wireframe 4.1, PRD F5).
 *
 * Privacy rules this file must keep:
 * - never read identifying headers (see IDENTIFYING_HEADERS in privacy.ts)
 * - never log: no logging calls anywhere in this app
 * - never set cookies
 * - store a ~1 km grid cell, never exact coordinates
 */

export interface Env {
  VAULT_SUPABASE_URL: string;
  VAULT_SUPABASE_ANON_KEY: string;
  OFFICER_DETAILS_PUBLIC_KEY: string;
  STATUS_CODE_PEPPER: string;
  PUBLIC_SITE_URL: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET") {
      if (url.pathname === "/") return respond(FORM_HTML, "text/html; charset=utf-8");
      if (url.pathname === "/app.js") return respond(FORM_JS, "text/javascript; charset=utf-8");
      if (url.pathname === "/app.css") return respond(FORM_CSS, "text/css; charset=utf-8");
      return respond("Not found", "text/plain", 404);
    }

    if (request.method === "POST" && url.pathname === "/api/submit") {
      return handleSubmit(request, env);
    }

    return respond("Method not allowed", "text/plain", 405);
  },
};

export async function handleSubmit(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Expected JSON" }, 415);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = PoliceSubmission.safeParse(body);
  if (!parsed.success) return json({ error: "Please check the form and try again." }, 422);
  const report = parsed.data;

  const officerDetails = report.officerDetails
    ? JSON.stringify(await seal(report.officerDetails, await importPublicKey(env.OFFICER_DETAILS_PUBLIC_KEY)))
    : null;

  const statusCode = generateStatusCode();
  const { salt, hash } = await hashStatusCode(statusCode, env.STATUS_CODE_PEPPER);

  // police.submit_report is SECURITY DEFINER and the only thing the anon key can call.
  const res = await fetchImpl(`${env.VAULT_SUPABASE_URL}/rest/v1/rpc/submit_report`, {
    method: "POST",
    headers: {
      apikey: env.VAULT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.VAULT_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": "police",
    },
    body: JSON.stringify({
      p_city: report.city,
      p_incident_type: report.incidentType,
      p_place: report.place,
      p_grid_cell: report.lat !== undefined && report.lng !== undefined ? gridCell(report.lat, report.lng) : null,
      p_when: report.when,
      p_occurred_on: report.occurredOn ?? null,
      p_description: report.description,
      p_officer_details_sealed: officerDetails,
      p_media_keys: report.mediaKeys,
      p_consent_to_forward: report.consentToForward,
      p_wants_legal_aid: report.wantsLegalAid,
      p_status_code_salt: salt,
      p_status_code_hash: hash,
      p_kind: report.kind,
      p_time_of_day: report.timeOfDay ?? null,
    }),
  });

  if (!res.ok) return json({ error: "We couldn't save your report. Please try again in a few minutes." }, 502);
  return json({ statusCode }, 201);
}
