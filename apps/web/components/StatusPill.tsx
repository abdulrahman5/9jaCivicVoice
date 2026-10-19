import type { IssueStatus } from "@civicvoice/validation";

const STYLES: Record<IssueStatus, { label: string; bg: string; fg: string }> = {
  received: { label: "Received", bg: "var(--cv-status-received-bg)", fg: "var(--cv-status-received-fg)" },
  verified: { label: "Verified", bg: "var(--cv-status-received-bg)", fg: "var(--cv-status-received-fg)" },
  forwarded: { label: "Forwarded", bg: "var(--cv-status-forwarded-bg)", fg: "var(--cv-status-forwarded-fg)" },
  acknowledged: { label: "Acknowledged", bg: "var(--cv-status-ack-bg)", fg: "var(--cv-status-ack-fg)" },
  in_progress: { label: "In progress", bg: "var(--cv-status-ack-bg)", fg: "var(--cv-status-ack-fg)" },
  resolved: { label: "Marked resolved", bg: "var(--cv-status-resolved-bg)", fg: "var(--cv-status-resolved-fg)" },
  confirmed_fixed: { label: "Confirmed fixed", bg: "var(--cv-status-resolved-bg)", fg: "var(--cv-status-resolved-fg)" },
  unconfirmed: { label: "Unconfirmed", bg: "var(--cv-status-received-bg)", fg: "var(--cv-status-received-fg)" },
  rejected: { label: "Rejected", bg: "var(--cv-status-received-bg)", fg: "var(--cv-status-received-fg)" },
  merged: { label: "Merged", bg: "var(--cv-status-received-bg)", fg: "var(--cv-status-received-fg)" },
};

export function StatusPill({ status }: { status: IssueStatus }) {
  const s = STYLES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
