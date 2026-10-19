import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { issueByRef } from "@/modules/public-data";

export const metadata: Metadata = { title: "Track report" };
export const revalidate = 60;

const STATUS_TEXT: Record<string, string> = {
  received: "Submitted",
  verified: "Verified by moderator",
  forwarded: "Forwarded to the agency",
  acknowledged: "Acknowledged by the agency",
  in_progress: "Work in progress",
  resolved: "Marked resolved",
  confirmed_fixed: "Confirmed fixed by residents",
  unconfirmed: "Resolved, not confirmed",
  rejected: "Not published",
  merged: "Merged with a similar report",
};

/** Track a report (wireframe 1.4). */
export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { ref } = await params;
  const isNew = (await searchParams).new === "1";
  const data = await issueByRef(ref.toUpperCase());

  if (!data) {
    // A brand-new report isn't public until a moderator verifies it.
    if (isNew) {
      return (
        <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
          <h1 className="text-2xl font-bold">Report received</h1>
          <p>
            Your reference number is <strong className="font-mono">{ref}</strong>. A moderator will check it within 24
            hours, then it appears here with updates.
          </p>
          <Link href="/">Back to home</Link>
        </main>
      );
    }
    notFound();
  }

  const { issue, events } = data;
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 p-5">
      <p className="font-mono text-sm">#{issue.ref_code}</p>
      <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
        <StatusPill status={issue.status} />
        <h1 className="text-lg font-bold">{issue.title}</h1>
        <p className="text-sm text-muted">Me too · {issue.metoo_count}</p>
      </section>
      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Progress</h2>
        <ol className="flex flex-col gap-3">
          {events.map((e, i) => (
            <li key={i} className="border-l-2 border-accent pl-3">
              <div className="text-sm font-semibold">{STATUS_TEXT[e.to_status] ?? e.to_status}</div>
              <div className="text-xs text-muted">{new Date(e.created_at).toLocaleString("en-NG")}</div>
              {e.public_note && (
                <blockquote className="mt-1 rounded-lg border border-line bg-surface p-2 text-sm">{e.public_note}</blockquote>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
