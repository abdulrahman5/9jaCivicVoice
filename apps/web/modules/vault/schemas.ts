import { z } from "zod";
import { POLICE_RECIPIENTS } from "@civicvoice/validation";

/** Inputs for the police moderation actions (docs/POLICE.md, section 3). Kept pure so they're unit-tested. */

const ReportId = z.uuid();

/** Statuses a moderator sets with a button. Rejecting has its own input; "forwarded" comes from recording a forward. */
export const PoliceStatusInput = z.object({
  reportId: ReportId,
  status: z.enum(["consistent", "closed"]),
});

/** Preset reasons, shown to the reporter on the status page. */
export const POLICE_REJECT_REASONS = {
  not_police: "This doesn't describe police conduct, so we can't take it forward.",
  identifies_someone: "It identifies a private person, which we can't forward or publish.",
  not_enough_detail: "There isn't enough detail to take this forward. You're welcome to report again with more information.",
  duplicate: "This repeats an earlier report, which we're already following up.",
  other: "",
} as const;
type RejectReason = keyof typeof POLICE_REJECT_REASONS;

export const PoliceRejectInput = z
  .object({
    reportId: ReportId,
    reason: z.enum(Object.keys(POLICE_REJECT_REASONS) as [RejectReason, ...RejectReason[]]),
    note: z.string().trim().max(200).default(""),
  })
  .transform((v) => ({ ...v, publicReason: [POLICE_REJECT_REASONS[v.reason], v.note].filter(Boolean).join(" ") }))
  .refine((v) => v.publicReason.length >= 5, { message: "Add a note explaining the reason", path: ["note"] })
  .refine((v) => v.publicReason.length <= 300, { message: "Keep the note shorter", path: ["note"] });

export const ForwardTextInput = z.object({
  reportId: ReportId,
  text: z.string().trim().min(10, "Write the redacted account (at least a sentence)").max(3000),
});

export const PoliceReplyInput = z.object({
  reportId: ReportId,
  body: z.string().trim().min(1, "Write a reply first").max(1000),
});

const Recipient = z.enum(POLICE_RECIPIENTS);
const Reference = z
  .string()
  .trim()
  .max(100, "Keep the reference under 100 characters")
  .transform((v) => v || undefined)
  .optional();

/** Records that the moderator sent the pack. The channel is a configured contact, or described by hand. */
export const RecordForwardInput = z
  .object({
    reportId: ReportId,
    recipient: Recipient,
    channel: z.string().trim().max(100),
    otherChannel: z.string().trim().max(100).default(""),
    reference: Reference,
  })
  .transform(({ channel, otherChannel, ...v }) => ({ ...v, channel: channel === "other" ? otherChannel : channel }))
  .refine((v) => v.channel.length >= 2, { message: "Say how you sent it", path: ["otherChannel"] });

/** Outcomes a moderator records. "awaiting" is the starting point; no_response is also set automatically after 30 days. */
export const ForwardOutcomeInput = z.object({
  reportId: ReportId,
  recipient: Recipient,
  outcome: z.enum(["acknowledged", "action_reported", "no_response"]),
  reference: Reference,
});

/**
 * Details that could identify someone and usually shouldn't be in text we forward or
 * send to a reporter. A prompt for the moderator, not a filter: names can't be caught this way.
 */
export function identifyingHints(text: string): string[] {
  const hints: string[] = [];
  if (/(?<!\d)(?:\+?234|0)[\s-]?[789][01](?:[\s-]?\d){8}(?!\d)/.test(text)) hints.push("a phone number");
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) hints.push("an email address");
  if (/\b(?:NIN|BVN)\b|\b\d{11}\b/.test(text)) hints.push("an ID number (NIN or BVN)");
  if (/@[A-Za-z0-9_]{3,}/.test(text.replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, ""))) hints.push("a social media handle");
  return hints;
}
