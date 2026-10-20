import "server-only";
import { civicServiceClient } from "@civicvoice/db";
import type { ForwardOutcome, PoliceIncidentType, PoliceKind, PoliceRecipient, PoliceStatus } from "@civicvoice/validation";
import { readPoliceReport, vaultServiceClient } from "@civicvoice/vault-db";
import { env } from "../env";
import { openOfficerDetails } from "./officer";

/**
 * Reads for the police console. Service role on the vault: callers must have checked
 * requireStaff(["police_moderator"]). Opening a report always goes through
 * police.read_report(), which writes police.access_log.
 */

export const POLICE_TABS = {
  new: "To review",
  consistent: "Reviewed",
  forwarded: "Forwarded",
  rejected: "Rejected",
  closed: "Closed",
} as const satisfies Record<PoliceStatus, string>;

export interface PoliceQueueRow {
  id: string;
  kind: PoliceKind;
  incident_type: PoliceIncidentType;
  city: "lagos" | "fct";
  status: PoliceStatus;
  consent_to_forward: boolean;
  created_at: string;
  unanswered_messages: number;
}

/** The queue: no free text, so it isn't logged. Oldest first. */
export async function policeQueue(status: PoliceStatus): Promise<PoliceQueueRow[]> {
  const { data, error } = await vaultServiceClient().rpc("list_reports", { p_status: status, p_limit: 100 });
  if (error) throw error;
  return (data ?? []) as PoliceQueueRow[];
}

/**
 * Different reports this moderator has opened since midnight in Lagos (for the wellbeing
 * prompt). Distinct, because every action on a report re-renders it and logs another read.
 */
export async function opensToday(moderatorId: string): Promise<number> {
  const WAT = 60 * 60 * 1000; // West Africa Time is UTC+1 all year
  const lagosNow = new Date(Date.now() + WAT);
  const midnight = Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate()) - WAT;
  const { data, error } = await vaultServiceClient()
    .from("access_log")
    .select("report_id")
    .eq("moderator_id", moderatorId)
    .eq("action", "read")
    .gte("created_at", new Date(midnight).toISOString())
    .limit(1000);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.report_id as string)).size;
}

export interface PoliceReportDetail {
  id: string;
  kind: PoliceKind;
  incident_type: PoliceIncidentType;
  city: "lagos" | "fct";
  place: string;
  grid_cell: string | null;
  when_bucket: "just_now" | "today" | "earlier";
  occurred_on: string | null;
  time_of_day: string | null;
  description: string;
  officer_details: string | null;
  media_count: number;
  consent_to_forward: boolean;
  wants_legal_aid: boolean;
  status: PoliceStatus;
  reject_reason: string | null;
  forward_text: string | null;
  created_at: string;
  forwarded_at: string | null;
  closed_at: string | null;
  forwards: {
    recipient: PoliceRecipient;
    channel: string;
    reference: string | null;
    outcome: ForwardOutcome;
    forwarded_at: string;
    forwarded_by: string;
  }[];
  messages: { id: number; author: "reporter" | "moderator"; moderator_id: string | null; body: string; created_at: string }[];
  access: { moderator_id: string; action: string; created_at: string }[];
}

/** Opens one report (logged), with its forwards, messages and recent access log. */
export async function openPoliceReport(reportId: string, moderatorId: string): Promise<PoliceReportDetail | null> {
  const vault = vaultServiceClient();
  const rows = (await readPoliceReport(vault, reportId, moderatorId)) as Record<string, unknown>[] | null;
  const r = rows?.[0];
  if (!r) return null;

  const [forwards, messages, access] = await Promise.all([
    vault
      .from("forwards")
      .select("recipient, channel, reference, outcome, forwarded_at, forwarded_by")
      .eq("report_id", reportId)
      .order("recipient"),
    vault.from("messages").select("id, author, moderator_id, body, created_at").eq("report_id", reportId).order("id"),
    vault
      .from("access_log")
      .select("moderator_id, action, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  for (const res of [forwards, messages, access]) if (res.error) throw res.error;

  return {
    id: r.id as string,
    kind: r.kind as PoliceKind,
    incident_type: r.incident_type as PoliceIncidentType,
    city: r.city as "lagos" | "fct",
    place: r.place as string,
    grid_cell: r.grid_cell as string | null,
    when_bucket: r.when_bucket as PoliceReportDetail["when_bucket"],
    occurred_on: r.occurred_on as string | null,
    time_of_day: r.time_of_day as string | null,
    description: r.description as string,
    officer_details: await openOfficerDetails(r.officer_details_sealed as string | null, env("vault").OFFICER_DETAILS_PRIVATE_KEY),
    media_count: ((r.media_keys as string[] | null) ?? []).length,
    consent_to_forward: r.consent_to_forward as boolean,
    wants_legal_aid: r.wants_legal_aid as boolean,
    status: r.status as PoliceStatus,
    reject_reason: r.reject_reason as string | null,
    forward_text: r.forward_text as string | null,
    created_at: r.created_at as string,
    forwarded_at: r.forwarded_at as string | null,
    closed_at: r.closed_at as string | null,
    forwards: (forwards.data ?? []) as PoliceReportDetail["forwards"],
    messages: (messages.data ?? []) as PoliceReportDetail["messages"],
    access: (access.data ?? []) as PoliceReportDetail["access"],
  };
}

/** Display names for staff ids (from the civic database's staff table). */
export async function staffNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await civicServiceClient().schema("ops").from("staff").select("user_id, display_name").in("user_id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((s) => [s.user_id as string, s.display_name as string]));
}
