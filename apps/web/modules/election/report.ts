import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { civicServiceClient } from "@civicvoice/db";
import { env } from "../env";

/** Election reports (task E4), shared by the web form and the WhatsApp bot. Server-only. */

export interface ElectionInfo {
  id: string;
  name: string;
  polls_on: string;
  opens_at: string;
  closes_at: string;
  is_training: boolean;
}

export interface ElectionCategory {
  id: string;
  stage: "opening" | "accreditation" | "voting" | "counting" | "any";
  label: string;
  severity: "critical" | "high" | "medium" | "info";
}

const election = () => civicServiceClient().schema("election");

/** The election taking reports now, if any. */
export async function currentElection(includeTraining = false): Promise<ElectionInfo | null> {
  const { data, error } = await election().rpc("current_election", { p_include_training: includeTraining });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ElectionInfo[])[0] ?? null;
}

export async function nextElection(): Promise<ElectionInfo | null> {
  const { data, error } = await election().rpc("next_election");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ElectionInfo[])[0] ?? null;
}

/** Categories in their fixed order (the WhatsApp menu numbers them in this order). */
export async function electionCategories(): Promise<ElectionCategory[]> {
  const { data, error } = await election().from("categories").select("id, stage, label, severity").order("sort");
  if (error) throw new Error(error.message);
  return (data ?? []) as ElectionCategory[];
}

/**
 * Anonymous sender id for limits and duplicates: an HMAC with a server secret, so the
 * database never holds a device id or phone number. WhatsApp senders use the same
 * hash as their bot session (modules/contact-hash.ts), passed in directly.
 */
export function webSenderHash(deviceId: string): string {
  return createHmac("sha256", env("secrets").CONTACT_HASH_PEPPER).update(`election-web:${deviceId}`).digest("hex");
}

/** A refusal the reporter should see (window closed, already reported, too many, unknown unit). */
export class ElectionReportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const FRIENDLY: Record<string, [string, number]> = {
  "reporting is not open for this election": ["Reporting for this election isn't open right now.", 409],
  "that is not a polling unit code": ["That isn't a polling unit code. Check your voter's card.", 422],
  "no polling unit with that code": ["We couldn't find that polling unit.", 404],
  "this election is not held in that state": ["This election isn't held in that state.", 422],
  "unknown category": ["Choose what happened from the list.", 422],
  "too many reports, please wait a while": ["You've sent several reports in the last hour. Please wait a while.", 429],
  "you have already reported this at this polling unit": ["You've already reported this at this polling unit. Thank you.", 409],
  "unknown election": ["That election isn't taking reports.", 404],
};

export interface NewElectionReport {
  electionId: string;
  puCode: string;
  category: string;
  description: string;
  mediaKeys: string[];
  channel: "web" | "whatsapp";
  senderHash: string;
  contactHash?: string | null;
  contactEnc?: string | null;
}

export async function submitElectionReport(input: NewElectionReport): Promise<{ ref: string; label: string }> {
  const { data, error } = await election().rpc("submit_report", {
    p_election_id: input.electionId,
    p_pu_code: input.puCode,
    p_category: input.category,
    p_description: input.description,
    p_media_keys: input.mediaKeys,
    p_channel: input.channel,
    p_sender_hash: input.senderHash,
    p_contact_hash: input.contactHash ?? null,
    p_contact_enc: input.contactEnc ?? null,
  });
  if (error) {
    const friendly = FRIENDLY[error.message];
    if (friendly) throw new ElectionReportError(...friendly);
    throw new Error(error.message);
  }
  const row = ((data ?? []) as { ref_code: string; label: string }[])[0]!;
  return { ref: row.ref_code, label: row.label };
}

/** Stores metadata-stripped JPEGs privately (media-private/election/<uuid>.jpg). */
export async function storeElectionPhotos(photos: Uint8Array[]): Promise<string[]> {
  const bucket = civicServiceClient().storage.from("media-private");
  const keys: string[] = [];
  for (const photo of photos) {
    const key = `election/${randomUUID()}.jpg`;
    const { error } = await bucket.upload(key, photo, { contentType: "image/jpeg", upsert: false });
    if (error) {
      await removeElectionPhotos(keys);
      throw new Error(`photo upload failed: ${error.message}`);
    }
    keys.push(key);
  }
  return keys;
}

/** Best effort, when a report fails after its photos were stored. */
export async function removeElectionPhotos(keys: string[]) {
  if (keys.length) await civicServiceClient().storage.from("media-private").remove(keys);
}

export interface ReportStatus {
  ref_code: string;
  election_name: string;
  pu_code: string;
  pu_name: string;
  category_label: string;
  label: "reported" | "corroborated" | "verified" | "rejected";
  reject_reason: string | null;
  created_at: string;
}

export async function electionReportStatus(ref: string): Promise<ReportStatus | null> {
  const { data, error } = await election().rpc("report_status", { p_ref: ref });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReportStatus[])[0] ?? null;
}
