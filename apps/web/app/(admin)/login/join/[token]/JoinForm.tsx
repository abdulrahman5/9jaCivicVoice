"use client";

import { useActionState } from "react";
import { inputClass, primaryButton } from "../../../ui";
import { join, type JoinState } from "./actions";

export function JoinForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(join, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Your name
        <span className="font-normal text-muted">As your coordinator knows you. Other moderators see it.</span>
        <input name="name" autoComplete="name" required maxLength={60} defaultValue={state.name} key={`n${state.name}`} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Email
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email} key={`e${state.email}`} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Password
        <span className="font-normal text-muted">At least 12 characters. Don&apos;t reuse one from another site.</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={12} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Password again
        <input name="confirm" type="password" autoComplete="new-password" required minLength={12} className={inputClass} />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-[var(--cv-status-ack-fg)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Creating your account…" : "Create my account"}
      </button>
    </form>
  );
}
