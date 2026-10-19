"use client";

import { useActionState, useState, useTransition } from "react";
import { startEnrollment, verifyEnrollment, type EnrollState } from "../actions";
import { inputClass, primaryButton } from "../../ui";

export function EnrollForm() {
  const [enrollment, setEnrollment] = useState<EnrollState | null>(null);
  const [starting, startTransition] = useTransition();

  if (!enrollment?.factorId) {
    return (
      <div className="flex flex-col gap-3">
        {enrollment?.error && (
          <p role="alert" className="text-sm text-[var(--cv-status-ack-fg)]">
            {enrollment.error}
          </p>
        )}
        <button
          type="button"
          disabled={starting}
          onClick={() => startTransition(async () => setEnrollment(await startEnrollment()))}
          className={primaryButton}
        >
          {starting ? "Preparing…" : "Show my QR code"}
        </button>
      </div>
    );
  }
  return <VerifyStep enrollment={enrollment} />;
}

function VerifyStep({ enrollment }: { enrollment: EnrollState }) {
  // Only the factor id goes back to the server; the QR code and secret stay in the browser.
  const [state, action, pending] = useActionState<EnrollState, FormData>(verifyEnrollment, {
    factorId: enrollment.factorId,
  });
  const qr = enrollment.qrCode?.startsWith("data:")
    ? enrollment.qrCode
    : `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrCode ?? "")}`;

  return (
    <form action={action} className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>In your authenticator app, add an account and scan this code.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      <img src={qr} alt="QR code for your authenticator app" width={200} height={200} className="self-center rounded-lg bg-white p-2" />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Can&apos;t scan? Enter this key instead</summary>
        <code className="mt-2 block break-all rounded-lg bg-fill p-2 font-mono text-xs">{enrollment.secret}</code>
      </details>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        6-digit code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className={`${inputClass} font-mono text-lg tracking-widest`}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-[var(--cv-status-ack-fg)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Checking…" : "Finish setup"}
      </button>
    </form>
  );
}
