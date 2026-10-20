/**
 * Cloudflare Turnstile check for police submissions and messages.
 *
 * Fails closed: with no secret configured, or if Cloudflare can't be reached,
 * the request is refused. Local development uses Cloudflare's published test
 * keys (see .dev.vars.example), which always pass.
 *
 * The visitor's IP is NOT sent (the optional `remoteip` field): this Worker never
 * reads it.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: unknown,
  secret: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret || typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const res = await fetchImpl(SITEVERIFY, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
