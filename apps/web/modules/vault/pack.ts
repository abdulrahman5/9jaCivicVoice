import type { PoliceIncidentType, PoliceKind, PoliceRecipient } from "@civicvoice/validation";
import { CITY_LABELS, POLICE_TYPE_LABELS, RECIPIENT_LABELS } from "./labels";

/**
 * The forwarding pack (docs/POLICE.md, section 4): plain text a moderator sends to the
 * CRU or PSC by phone, WhatsApp or email. It carries what they need to act and nothing
 * about the reporter: no status code, no time finer than the day, no grid cell, no
 * filing timestamp, and the redacted text rather than the original.
 */

export interface PackInput {
  id: string;
  kind: PoliceKind;
  incident_type: PoliceIncidentType;
  city: keyof typeof CITY_LABELS;
  place: string;
  when_bucket: "just_now" | "today" | "earlier";
  occurred_on: string | null;
  created_at: string;
  forward_text: string;
  officer_details: string | null;
}

/** Our reference for a report: short, and derived from its random id, so it says nothing about the reporter. */
export const packReference = (reportId: string) => `CV-${reportId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

/** The date of the incident, to the day. "Just now" and "today" mean the day it was filed. */
export function incidentDate({ when_bucket, occurred_on, created_at }: Pick<PackInput, "when_bucket" | "occurred_on" | "created_at">) {
  if (occurred_on) return occurred_on;
  const filed = new Date(new Date(created_at).getTime() + 60 * 60 * 1000).toISOString().slice(0, 10); // WAT
  return when_bucket === "earlier" ? `before ${filed}` : filed;
}

export function buildForwardingPack(r: PackInput, recipient: PoliceRecipient): string {
  const commendation = r.kind === "commendation";
  const lines = [
    `CivicVoice NG: ${commendation ? "commendation of police conduct" : "complaint about police conduct"}`,
    `To: ${RECIPIENT_LABELS[recipient]}`,
    `Our reference: ${packReference(r.id)}`,
    "",
    `${commendation ? "What the officer did" : "Type"}: ${POLICE_TYPE_LABELS[r.incident_type]}`,
    `Date: ${incidentDate(r)}`,
    `Location: ${r.place}, ${CITY_LABELS[r.city]}`,
  ];
  if (r.officer_details) lines.push(`Officer, unit or vehicle (as reported): ${r.officer_details}`);
  lines.push(
    "",
    commendation ? "What happened:" : "Account:",
    r.forward_text.trim(),
    "",
    "The person who reported this asked us to pass it on. They reported anonymously, so we can't share their identity or contact details.",
    commendation
      ? "Please pass this recognition to the officer and their command."
      : `Please acknowledge receipt and tell us of any action, quoting ${packReference(r.id)}.`,
  );
  return lines.join("\n");
}
