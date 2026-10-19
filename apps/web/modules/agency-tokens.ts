import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiring, no-login links for agencies (PRD F7).
 * Format: base64url(payload).base64url(hmac). The token id (jti) is also
 * stored in ops.agency_tokens so a link can be revoked before it expires.
 */

export interface AgencyTokenPayload {
  jti: string;
  agencyId: string;
  issueId: string;
  /** Expiry, Unix seconds. */
  exp: number;
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

function hmac(data: string, key: string) {
  return createHmac("sha256", key).update(data).digest();
}

export function signAgencyToken(
  input: { agencyId: string; issueId: string },
  key: string,
  now = Date.now(),
  ttlSeconds = DEFAULT_TTL_SECONDS,
): { token: string; payload: AgencyTokenPayload } {
  const payload: AgencyTokenPayload = {
    jti: randomBytes(12).toString("base64url"),
    agencyId: input.agencyId,
    issueId: input.issueId,
    exp: Math.floor(now / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${body}.${hmac(body, key).toString("base64url")}`, payload };
}

export type VerifyResult =
  | { ok: true; payload: AgencyTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/** Checks the signature and expiry. Revocation is checked against the database by the caller. */
export function verifyAgencyToken(token: string, key: string, now = Date.now()): VerifyResult {
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, reason: "malformed" };
  const expected = hmac(body, key);
  const received = Buffer.from(sig, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  let payload: AgencyTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp * 1000 < now) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
