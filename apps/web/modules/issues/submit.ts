import "server-only";
import { civicServiceClient } from "@civicvoice/db";
import type { Category, Channel, City, ReportSubmission } from "@civicvoice/validation";
import { encryptContact } from "../contact-crypto";
import { hashContact, normalisePhone } from "../contact-hash";
import { env } from "../env";

export interface SubmitResult {
  reportId: string;
  issueId: string;
  ref: string;
  /** Secret the browser keeps to confirm the fix later; only its hash is stored. */
  trackingToken: string;
}

/**
 * Stores a web report through core.submit_report(), which (in one transaction)
 * creates the issue, fills LGA and ward from the boundary tables, writes the
 * "received" status event and enqueues triage.
 */
export async function submitWebReport(input: ReportSubmission): Promise<SubmitResult> {
  return submitReport({
    city: input.city,
    category: input.category,
    subcategory: input.subcategory,
    location: input.location,
    description: input.description,
    since: input.since,
    mediaKeys: input.mediaKeys,
    phone: input.phone,
    language: input.language,
    channel: input.channel,
  });
}

export interface NewReport {
  city: City;
  category: Category;
  subcategory: string;
  location: { lat: number; lng: number } | { text: string };
  description: string;
  since?: string;
  mediaKeys?: string[];
  /** Only when the reporter wants updates. Stored hashed + encrypted, never in clear. */
  phone?: string;
  language: string;
  channel: Channel;
}

/** Shared by the web flow and the WhatsApp bot. */
export async function submitReport(input: NewReport): Promise<SubmitResult> {
  const secrets = env("secrets");
  const contactHash = input.phone ? hashContact(input.phone, secrets.CONTACT_HASH_PEPPER) : null;
  const contactEncrypted = input.phone ? encryptContact(normalisePhone(input.phone), secrets.CONTACT_ENC_KEY) : null;
  const point = "lat" in input.location ? input.location : null;

  const { data, error } = await civicServiceClient()
    .schema("core")
    .rpc("submit_report", {
      p_city: input.city,
      p_category: input.category,
      p_subcategory: input.subcategory,
      p_lat: point?.lat ?? null,
      p_lng: point?.lng ?? null,
      p_location_text: "text" in input.location ? input.location.text : null,
      p_description: input.description,
      p_since: input.since ?? null,
      p_media_keys: input.mediaKeys ?? [],
      p_contact_hash: contactHash,
      p_contact_encrypted: contactEncrypted,
      p_language: input.language,
      p_channel: input.channel,
    });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as {
    report_id: string;
    issue_id: string;
    ref_code: string;
    tracking_token: string;
  };
  return { reportId: row.report_id, issueId: row.issue_id, ref: row.ref_code, trackingToken: row.tracking_token };
}
