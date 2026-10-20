"use client";

import { useActionState, useState } from "react";
import type { ForwardOutcome, PoliceRecipient } from "@civicvoice/validation";
import { OUTCOME_LABELS, RECIPIENT_LABELS } from "@/modules/vault/labels";
import { channelFor, type Contact } from "@/modules/vault/recipients";
import { dangerButton, inputClass, primaryButton, secondaryButton } from "../../../ui";
import {
  recordForward,
  rejectPoliceReport,
  replyToReporter,
  saveForwardText,
  setForwardOutcome,
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

const CONTACT_HREF: Record<Contact["kind"], (v: string) => string | null> = {
  phone: (v) => `tel:${v.replace(/[^\d+]/g, "")}`,
  whatsapp: () => null, // never a wa.me link with the pack in the URL: copy and paste instead
  email: (v) => `mailto:${v}`,
  web: (v) => v,
};

/** One recipient: the pack to copy, where to send it, and the form to record that it was sent. */
export function ForwardPanel({
  reportId,
  recipient,
  pack,
  contacts,
}: {
  reportId: string;
  recipient: PoliceRecipient;
  pack: string;
  contacts: Contact[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordForward, {});
  const [copied, setCopied] = useState(false);
  const [channel, setChannel] = useState(contacts[0] ? channelFor(contacts[0]) : "other");
  return (
    <div className="flex flex-col gap-2 border-b border-line pb-4 last:border-0 last:pb-0">
      <h3 className="text-sm font-semibold">{RECIPIENT_LABELS[recipient]}</h3>
      <textarea
        readOnly
        value={pack}
        rows={10}
        aria-label={`Forwarding pack for the ${RECIPIENT_LABELS[recipient]}`}
        className={`${inputClass} h-auto py-2 font-mono text-xs`}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className={secondaryButton}
        onClick={() => navigator.clipboard.writeText(pack).then(() => setCopied(true))}
      >
        {copied ? "Copied" : "Copy pack"}
      </button>
      {contacts.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {contacts.map((c) => {
            const href = CONTACT_HREF[c.kind](c.value);
            return (
              <li key={channelFor(c)}>
                {c.label}: {href ? <a href={href}>{c.value}</a> : <span className="font-mono">{c.value}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted">
          No official contacts are set up for the {RECIPIENT_LABELS[recipient]} yet. Send it through a channel you&apos;ve
          checked, and describe it below.
        </p>
      )}
      <form action={action} className="flex flex-col gap-2">
        <Hidden reportId={reportId} />
        <input type="hidden" name="recipient" value={recipient} />
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Sent via
          <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={inputClass}>
            {contacts.map((c) => (
              <option key={channelFor(c)} value={channelFor(c)}>
                {c.label} ({c.value})
              </option>
            ))}
            <option value="other">Other (describe)</option>
          </select>
        </label>
        {channel === "other" && (
          <input name="otherChannel" maxLength={100} placeholder="e.g. CRU email, PSC office" aria-label="Channel" className={inputClass} />
        )}
        <input name="reference" maxLength={100} placeholder="Their reference number, if they gave one" aria-label="Reference" className={inputClass} />
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : "I've sent it: record"}
        </button>
        <Feedback state={state} />
      </form>
    </div>
  );
}

export function OutcomeForm({
  reportId,
  recipient,
  current,
}: {
  reportId: string;
  recipient: PoliceRecipient;
  current: ForwardOutcome;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setForwardOutcome, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Hidden reportId={reportId} />
      <input type="hidden" name="recipient" value={recipient} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Outcome
        <select name="outcome" defaultValue={current === "awaiting" ? "acknowledged" : current} className={inputClass}>
          {(["acknowledged", "action_reported", "no_response"] as const).map((o) => (
            <option key={o} value={o}>
              {OUTCOME_LABELS[o]}
            </option>
          ))}
        </select>
      </label>
      <input name="reference" maxLength={100} placeholder="Reference (optional)" aria-label="Reference" className={`${inputClass} min-w-0 flex-1`} />
      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? "Saving…" : "Save outcome"}
      </button>
      <div className="basis-full">
        <Feedback state={state} />
      </div>
    </form>
  );
}
