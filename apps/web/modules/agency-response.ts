import "server-only";
import { civicServiceClient } from "@civicvoice/db";
import { verifyAgencyToken, type AgencyTokenPayload } from "./agency-tokens";
import { env } from "./env";

/** Resolves an agency link to its payload, checking signature, expiry and revocation. */
export async function resolveAgencyToken(token: string): Promise<AgencyTokenPayload | null> {
  const result = verifyAgencyToken(token, env("secrets").AGENCY_TOKEN_KEY);
  if (!result.ok) return null;

  const { data } = await civicServiceClient()
    .schema("ops")
    .from("agency_tokens")
    .select("revoked_at")
    .eq("jti", result.payload.jti)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  return result.payload;
}
