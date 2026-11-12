"use client";

import { useActionState, useState } from "react";
import { inputClass, primaryButton, secondaryButton } from "../../../ui";
import { createInviteLink, type InviteState } from "../actions";

interface Props {
  canInviteCoordinators: boolean;
  states: { code: number; name: string }[];
  lgas: { state_code: number; code: number; name: string }[];
}

export function InviteForm({ canInviteCoordinators, states, lgas }: Props) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInviteLink, {});
  const [role, setRole] = useState("lga_moderator");
  const [stateCode, setStateCode] = useState(String(states.length === 1 ? states[0]!.code : ""));
  const [copied, setCopied] = useState("");
  const stateLgas = lgas.filter((l) => String(l.state_code) === stateCode);

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        {canInviteCoordinators && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Role
            <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
              <option value="lga_moderator">LGA moderator</option>
              <option value="state_coordinator">State coordinator</option>
            </select>
          </label>
        )}
        {!canInviteCoordinators && <input type="hidden" name="role" value="lga_moderator" />}
        {states.length > 1 ? (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            State
            <select name="state" required value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={inputClass}>
              <option value="">Choose a state</option>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="state" value={stateCode} />
        )}
        {role === "lga_moderator" && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            LGA
            <select name="lga" required className={inputClass} disabled={!stateCode} key={stateCode}>
              <option value="">{stateLgas.length ? "Choose an LGA" : "Choose a state first"}</option>
              {stateLgas.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Who it&apos;s for <span className="font-normal text-muted">Optional, only you and other coordinators see it</span>
          <input name="note" maxLength={80} placeholder="e.g. Amaka from the youth network" className={inputClass} />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-[var(--cv-status-ack-fg)]">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Creating…" : "Create invite link"}
        </button>
      </form>

      {state.link && (
        <div role="status" className="flex flex-col gap-2 rounded-lg bg-fill p-3 text-sm">
          <p className="font-semibold">Invite link{state.forWhom ? ` for ${state.forWhom}` : ""}. It&apos;s shown only once.</p>
          <code className="break-all rounded bg-surface p-2 text-xs">{state.link}</code>
          <button
            type="button"
            className={`${secondaryButton} h-9 self-start text-sm`}
            onClick={async () => {
              await navigator.clipboard.writeText(state.link!).catch(() => undefined);
              setCopied(state.link!);
            }}
          >
            {copied === state.link ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
