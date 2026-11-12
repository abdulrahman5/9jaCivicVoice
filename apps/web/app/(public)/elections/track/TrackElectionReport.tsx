"use client";

import { useEffect, useState } from "react";

interface Status {
  ref_code: string;
  election_name: string;
  pu_code: string;
  pu_name: string;
  category_label: string;
  label: "reported" | "corroborated" | "verified" | "rejected";
  reject_reason: string | null;
}

const MEANING: Record<Status["label"], string> = {
  reported: "Received. It's in the counts for your LGA and state. More detail is shown once others report the same thing or a moderator checks it.",
  corroborated: "Others at this polling unit reported the same thing.",
  verified: "A moderator has checked it.",
  rejected: "Not published.",
};

export function TrackElectionReport({ initialRef }: { initialRef: string }) {
  const [ref, setRef] = useState(initialRef);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");

  async function check(value: string) {
    setError("");
    setStatus(null);
    try {
      const res = await fetch(`/api/election/reports?ref=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (res.ok) setStatus(data.status);
      else setError(data.error ?? "Lookup failed.");
    } catch {
      setError("No connection. Try again.");
    }
  }

  useEffect(() => {
    if (initialRef) void check(initialRef);
  }, [initialRef]);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void check(ref);
        }}
      >
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="EV-7KQ2M9X"
          autoCapitalize="characters"
          className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 font-mono"
          aria-label="Reference"
        />
        <button type="submit" className="h-11 rounded-card bg-accent px-4 font-semibold text-white">
          Check
        </button>
      </form>
      {error && <p role="alert" className="text-[14px] text-[var(--cv-status-ack-fg)]">{error}</p>}
      {status && (
        <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
          <p className="font-mono text-sm">{status.ref_code}</p>
          <p className="text-[15px] font-semibold">{status.category_label}</p>
          <p className="text-[13px] text-muted">
            {status.pu_name} ({status.pu_code}) · {status.election_name}
          </p>
          <p className="mt-2 text-[15px]">
            {MEANING[status.label]}
            {status.label === "rejected" && status.reject_reason && ` ${status.reject_reason}`}
          </p>
        </div>
      )}
    </div>
  );
}
