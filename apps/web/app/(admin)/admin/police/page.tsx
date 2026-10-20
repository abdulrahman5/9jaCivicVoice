import type { Metadata } from "next";
import Link from "next/link";
import type { PoliceStatus } from "@civicvoice/validation";
import { requireStaff } from "@/modules/auth";
import { isConfigured } from "@/modules/env";
import { POLICE_TABS, opensToday, policeQueue } from "@/modules/vault/data";
import { CITY_LABELS, POLICE_TYPE_LABELS } from "@/modules/vault/labels";

export const metadata: Metadata = { title: "Police reports" };

/** Daily opens after which the queue suggests a break (docs/POLICE.md, section 3). A prompt, never a block. */
const DAILY_OPENS_PROMPT = 20;

function age(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 36e5;
  return hours < 1 ? "<1h" : hours < 48 ? `${Math.floor(hours)}h` : `${Math.floor(hours / 24)}d`;
}

/** Police report queue: police moderators only. Lists no free text, so viewing it isn't logged. */
export default async function PoliceQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff();
  if (staff.role !== "police_moderator") {
    return <p className="text-muted">Police reports are only open to the two trained police moderators.</p>;
  }
  if (!isConfigured("vault")) {
    return <p className="text-muted">The police vault isn&apos;t configured on this deployment.</p>;
  }
  const sp = await searchParams;
  const tab: PoliceStatus = sp.tab && sp.tab in POLICE_TABS ? (sp.tab as PoliceStatus) : "new";
  const [rows, opens] = await Promise.all([policeQueue(tab), opensToday(staff.userId)]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Police reports</h1>
        <p className="text-sm text-muted">
          Opening a report is logged. Photos stay blurred until you choose to view them.
        </p>
      </div>

      {opens >= DAILY_OPENS_PROMPT && (
        <p role="status" className="rounded-lg bg-accent-soft p-3 text-sm text-accent-strong">
          You&apos;ve opened {opens} different reports today. This work is heavy: consider a break, or handing the rest to the other
          police moderator.
        </p>
      )}

      <nav aria-label="Stage" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {(Object.keys(POLICE_TABS) as PoliceStatus[]).map((t) => (
          <Link
            key={t}
            href={`/admin/police?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`px-3 py-2 no-underline ${t === tab ? "border-b-2 border-accent font-semibold text-ink" : "text-muted"}`}
          >
            {POLICE_TABS[t]}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="p-3">Report</th>
              <th className="p-3">City</th>
              <th className="p-3">Forwarding</th>
              <th className="p-3">New messages</th>
              <th className="p-3">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  Nothing here.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-fill">
                  <td className="p-3">
                    {/* No prefetch: rendering a report logs a read, so only a real click should do it. */}
                    <Link href={`/admin/police/${r.id}`} prefetch={false} className="font-semibold text-ink">
                      {POLICE_TYPE_LABELS[r.incident_type]}
                    </Link>
                    <div className="text-[11px] text-muted">{r.kind === "commendation" ? "Commendation" : "Misconduct"}</div>
                  </td>
                  <td className="p-3">{CITY_LABELS[r.city]}</td>
                  <td className="p-3">{r.consent_to_forward ? "Consented" : <span className="text-muted">No consent</span>}</td>
                  <td className="p-3">{r.unanswered_messages > 0 ? <strong>{r.unanswered_messages}</strong> : "—"}</td>
                  <td className="p-3">{age(r.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
