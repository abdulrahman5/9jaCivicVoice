import { z } from "zod";

/** Issue status model shared by every channel (PRD "Status model"). */
export const ISSUE_STATUSES = [
  "received",
  "verified",
  "forwarded",
  "acknowledged",
  "in_progress",
  "resolved",
  "confirmed_fixed",
  "unconfirmed",
  "rejected",
  "merged",
] as const;
export const IssueStatus = z.enum(ISSUE_STATUSES);
export type IssueStatus = z.infer<typeof IssueStatus>;

export type Actor = "system" | "moderator" | "agency" | "citizen";

/** Allowed transitions, and who may make them. Mirrors core.can_transition() in SQL. */
const TRANSITIONS: Record<IssueStatus, Partial<Record<IssueStatus, Actor[]>>> = {
  received: { verified: ["moderator"], rejected: ["moderator"], merged: ["moderator"] },
  verified: { forwarded: ["moderator", "system"], rejected: ["moderator"], merged: ["moderator"] },
  forwarded: {
    acknowledged: ["agency", "moderator"],
    in_progress: ["agency", "moderator"],
    resolved: ["agency", "moderator"],
  },
  acknowledged: { in_progress: ["agency", "moderator"], resolved: ["agency", "moderator"] },
  in_progress: { resolved: ["agency", "moderator"] },
  resolved: {
    confirmed_fixed: ["citizen", "moderator"],
    acknowledged: ["citizen", "moderator"], // "Not yet" reopens the issue
    unconfirmed: ["system"],
  },
  confirmed_fixed: {},
  unconfirmed: { confirmed_fixed: ["citizen"], acknowledged: ["citizen"] },
  rejected: {},
  merged: {},
};

export function canTransition(from: IssueStatus, to: IssueStatus, actor: Actor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

/** Statuses the reporter is notified about (verified is silent to avoid noise). */
export const NOTIFY_ON: ReadonlySet<IssueStatus> = new Set([
  "received",
  "forwarded",
  "acknowledged",
  "in_progress",
  "resolved",
  "confirmed_fixed",
  "rejected",
  "merged",
]);
