import "server-only";

/**
 * Cloudflare Turnstile check for public form posts.
 *
 * Production fails closed: with no TURNSTILE_SECRET_KEY, every submission is
 * refused, so a misconfigured deployment can't silently accept bot traffic.
 * Development skips the check when no secret is set. Preview deployments use
 * Cloudflare's published test keys, which always pass (see docs/PREVIEW.md).
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
  { secret = process.env.TURNSTILE_SECRET_KEY, production = process.env.NODE_ENV === "production", fetchImpl = fetch } = {},
): Promise<boolean> {
  if (!secret) {
    if (production) console.error("TURNSTILE_SECRET_KEY is not set: refusing public submissions.");
    return !production;
  }
  if (!token || token.length > 2048) return false;

  try {
    const res = await fetchImpl(SITEVERIFY, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, ...(ip !== "unknown" && { remoteip: ip }) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Network failure or timeout: fail closed, the visitor can retry.
    return false;
  }
}
