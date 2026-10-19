import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { civicServiceClient } from "@civicvoice/db";
import { canTransition, IssueStatus } from "@civicvoice/validation";
import { StatusPill } from "@/components/StatusPill";
import { resolveAgencyToken } from "@/modules/agency-response";
import { respondAsAgency } from "./actions";

export const metadata: Metadata = { title: "Respond to issue", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const AGENCY_STATUSES = ["acknowledged", "in_progress", "resolved"] as const;

/** No-login agency response page (PRD F7). */
export default async function AgencyResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await resolveAgencyToken(token);
  if (!payload) notFound();

  const { data: issue } = await civicServiceClient()
    .schema("core")
    .from("issues")
    .select("ref_code, title, status, lga, metoo_count")
    .eq("id", payload.issueId)
    .single();
  if (!issue) notFound();

  const status = IssueStatus.parse(issue.status);
  const options = AGENCY_STATUSES.filter((s) => canTransition(status, s, "agency"));

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 p-6">
      <p className="font-mono text-sm text-muted">{issue.ref_code}</p>
      <h1 className="text-2xl font-bold">{issue.title}</h1>
      <div className="flex items-center gap-3">
        <StatusPill status={status} />
        <span className="text-sm text-muted">
          {issue.lga} · {issue.metoo_count} residents affected
        </span>
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-muted">No update is needed from your agency at this stage.</p>
      ) : (
        <form action={respondAsAgency} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
          <input type="hidden" name="token" value={token} />
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Status
            <select name="status" className="h-11 rounded-lg border border-line px-3 font-normal">
              {options.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Public reply
            <span className="font-normal text-muted">Sent to the residents who reported this, and shown on the issue page.</span>
            <textarea name="note" required minLength={10} maxLength={1000} rows={4} className="rounded-lg border border-line p-3 font-normal" />
          </label>
          <button type="submit" className="h-11 rounded-card bg-accent font-semibold text-white">
            Post update
          </button>
        </form>
      )}
    </main>
  );
}
