"use client";

import { useActionState } from "react";
import { dangerButton, inputClass, primaryButton, secondaryButton } from "../../../ui";
import {
  rejectPoliceReport,
  replyToReporter,
  saveForwardText,
  setPoliceStatus,
  type ActionState,
} from "./actions";

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-[var(--cv-status-ack-bg)] p-2 text-sm text-[var(--cv-status-ack-fg)]">
        {state.error}
      </p>
    );
  }
  if (!state.message) return null;
  return (
    <p role="status" className="rounded-lg bg-accent-soft p-2 text-sm text-accent-strong">
      {state.message}
    </p>
  );
}

const Hidden = ({ reportId }: { reportId: string }) => <input type="hidden" name="reportId" value={reportId} />;

export function StatusButton({
  reportId,
  status,
  label,
  primary = false,
}: {
  reportId: string;
  status: "consistent" | "closed";
  label: string;
  primary?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setPoliceStatus, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Hidden reportId={reportId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" disabled={pending} className={primary ? primaryButton : secondaryButton}>
        {pending ? "Saving…" : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

const REASON_LABELS = {
  not_police: "Not about police conduct",
  identifies_someone: "Identifies a private person",
  not_enough_detail: "Not enough detail",
  duplicate: "Repeats an earlier report",
  other: "Other (explain below)",
} as const;

export function RejectForm({ reportId }: { reportId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(rejectPoliceReport, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Hidden reportId={reportId} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Reason
        <select name="reason" defaultValue="not_enough_detail" className={inputClass}>
          {Object.entries(REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Note to the reporter <span className="font-normal text-muted">Optional. Shown on their status page.</span>
        <input name="note" maxLength={200} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={dangerButton}>
        {pending ? "Rejecting…" : "Reject"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ForwardTextForm({ reportId, initial }: { reportId: string; initial: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveForwardText, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Hidden reportId={reportId} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Redacted account for the CRU and PSC
        <span className="font-normal text-muted">
          Remove anything that could identify the reporter or a bystander: names, phone numbers, exact times, unusual
          details only they would know. The original stays unchanged.
        </span>
        <textarea name="text" defaultValue={initial} rows={8} maxLength={3000} className={`${inputClass} h-auto py-2`} />
      </label>
      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? "Saving…" : "Save redacted copy"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ReplyForm({ reportId }: { reportId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(replyToReporter, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Hidden reportId={reportId} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Reply to the reporter
        <span className="font-normal text-muted">
          Never ask for a name, phone number, address or anything else that could identify them.
        </span>
        <textarea name="body" rows={3} maxLength={1000} className={`${inputClass} h-auto py-2`} />
      </label>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Sending…" : "Send reply"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
