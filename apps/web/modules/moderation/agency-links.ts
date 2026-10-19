import "server-only";
import { civicServiceClient } from "@civicvoice/db";
import { signAgencyToken } from "../agency-tokens";
import { env } from "../env";

/**
 * Creates a signed, no-login response link for an agency and records its id so
 * it can be revoked. During the pilot, moderators also paste this link into
 * their own email to the agency, until the forward_agency email job lands.
 */
export async function createAgencyLink(issueId: string, agencyId: string): Promise<string> {
  const { token, payload } = signAgencyToken({ agencyId, issueId }, env("secrets").AGENCY_TOKEN_KEY);
  const { error } = await civicServiceClient()
    .schema("ops")
    .from("agency_tokens")
    .insert({
      jti: payload.jti,
      agency_id: agencyId,
      issue_id: issueId,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    });
  if (error) throw error;
  return `${env("app").NEXT_PUBLIC_SITE_URL}/r/${token}`;
}
