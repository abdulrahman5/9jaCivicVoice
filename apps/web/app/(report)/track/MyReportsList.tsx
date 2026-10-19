"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadMyReports, type MyReport } from "@/modules/my-reports";

export function MyReportsList() {
  const [reports, setReports] = useState<MyReport[] | null>(null);
  useEffect(() => setReports(loadMyReports()), []);

  if (reports === null) return null;
  if (reports.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line p-4 text-sm text-muted">
        Reports you submit from this phone appear here. Reported on WhatsApp? Reply 2 in the chat to check status.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {reports.map((r) => (
        <li key={r.ref}>
          <Link
            href={`/track/${r.ref}`}
            className="block rounded-card border border-line bg-surface p-4 font-mono text-sm text-ink no-underline"
          >
            {r.ref}
          </Link>
        </li>
      ))}
    </ul>
  );
}
