"use client";

import { useActionState, useState } from "react";
import { TAXONOMY, type Category } from "@civicvoice/validation";
import type { REJECT_REASONS } from "@/modules/moderation/schemas";
import { dangerButton, inputClass, primaryButton, secondaryButton } from "../../../ui";
import {
  editIssue,
  mergeIssue,
  newAgencyLink,
  rejectIssue,
  routeIssue,
  verifyIssue,
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
    <div role="status" className="flex flex-col gap-2 rounded-lg bg-accent-soft p-2 text-sm text-accent-strong">
      <span>{state.message}</span>
      {state.agencyLink && <CopyLink link={state.agencyLink} />}
    </div>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} min-w-0 flex-1 font-mono text-xs`} aria-label="Agency link" />
      <button
        type="button"
        className={secondaryButton}
        onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

const Hidden = ({ issueId }: { issueId: string }) => <input type="hidden" name="issueId" value={issueId} />;

export function VerifyForm({ issueId }: { issueId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(verifyIssue, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Hidden issueId={issueId} />
      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? "Verifying…" : "Verify only"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function RouteForm({
  issueId,
  agencies,
  disabledReason,
}: {
  issueId: string;
  agencies: { id: string; name: string; suggested: boolean }[];
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(routeIssue, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Hidden issueId={issueId} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Route to
        <select name="agencyId" required defaultValue="" className={inputClass} disabled={Boolean(disabledReason)}>
          <option value="" disabled>
            Choose an agency…
          </option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.suggested ? "★ " : ""}
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {disabledReason && <p className="text-xs text-muted">{disabledReason}</p>}
      <button type="submit" disabled={pending || Boolean(disabledReason)} className={primaryButton}>
        {pending ? "Forwarding…" : "Verify & forward"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function NewLinkForm({ issueId }: { issueId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(newAgencyLink, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Hidden issueId={issueId} />
      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? "Creating…" : "Create agency link"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

const REASON_LABELS: Record<keyof typeof REJECT_REASONS, string> = {
  spam: "Spam or not genuine",
  off_topic: "Off-topic",
  outside_pilot: "Outside the pilot area",
  personal_attack: "Targets a person / abusive",
  not_enough_detail: "Not enough detail",
  other: "Other (explain below)",
};

export function RejectForm({ issueId }: { issueId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(rejectIssue, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Hidden issueId={issueId} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Reason
        <select name="reason" defaultValue="spam" className={inputClass}>
          {Object.entries(REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Note to the reporter <span className="font-normal text-muted">Optional, added after the reason. Shown to them.</span>
        <input name="note" maxLength={500} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={dangerButton}>
        {pending ? "Rejecting…" : "Reject"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function MergeForm({
  issueId,
  suggestions,
}: {
  issueId: string;
  suggestions: { ref_code: string; title: string; distance_m: number; metoo_count: number }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mergeIssue, {});
  const [target, setTarget] = useState(suggestions[0]?.ref_code ?? "");
  return (
    <form action={action} className="flex flex-col gap-2">
      <Hidden issueId={issueId} />
      {suggestions.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {suggestions.map((s) => (
            <li key={s.ref_code}>
              <label className="flex items-center gap-2">
                <input type="radio" name="pick" checked={target === s.ref_code} onChange={() => setTarget(s.ref_code)} />
                <span>
                  <span className="font-mono">{s.ref_code}</span> {s.title} · {Math.round(s.distance_m)} m away · Me too{" "}
                  {s.metoo_count}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Merge into
        <input
          name="targetRef"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="e.g. LAG-0000"
          className={`${inputClass} font-mono`}
        />
      </label>
      <button type="submit" disabled={pending || !target} className={secondaryButton}>
        {pending ? "Merging…" : "Merge as duplicate"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function EditForm({
  issueId,
  category,
  subcategory,
  lat,
  lng,
}: {
  issueId: string;
  category: Category;
  subcategory: string;
  lat: number | null;
  lng: number | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(editIssue, {});
  const [cat, setCat] = useState<Category>(category);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Hidden issueId={issueId} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Category
          <select name="category" value={cat} onChange={(e) => setCat(e.target.value as Category)} className={inputClass}>
            {(Object.keys(TAXONOMY) as Category[]).map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Sub-category
          <select
            key={cat}
            name="subcategory"
            defaultValue={cat === category ? subcategory : TAXONOMY[cat][0]}
            className={inputClass}
          >
            {TAXONOMY[cat].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Latitude
          <input name="lat" inputMode="decimal" defaultValue={lat ?? ""} placeholder="6.6018" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Longitude
          <input name="lng" inputMode="decimal" defaultValue={lng ?? ""} placeholder="3.3515" className={inputClass} />
        </label>
      </div>
      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? "Saving…" : "Save changes"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
