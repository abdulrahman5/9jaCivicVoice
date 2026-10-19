"use client";

import { useActionState } from "react";
import { verifyCode, type FormState } from "../actions";
import { inputClass, primaryButton } from "../../ui";

export function CodeForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyCode, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        6-digit code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className={`${inputClass} font-mono text-lg tracking-widest`}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-[var(--cv-status-ack-fg)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
