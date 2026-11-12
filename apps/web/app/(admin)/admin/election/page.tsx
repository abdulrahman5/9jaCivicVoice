import Link from "next/link";
import { currentElection, nextElection } from "@/modules/election/report";
import { ROLE_LABEL, incidentsInScope, requireElectionStaff, type ScopedIncident } from "@/modules/election/staff";
import { PracticeControls } from "./PracticeControls";

export const dynamic = "force-dynamic";

const SEVERITY: Record<ScopedIncident["severity"], string> = {
  critical: "bg-[var(--cv-status-ack-bg)] text-[var(--cv-status-ack-fg)]",
  high: "bg-fill text-ink",
  medium: "bg-fill text-muted",
  info: "bg-fill text-muted",
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" });
}

/**
 * The election console home (task E5): who you are, where you moderate, and the incidents in
 * your area. Practice mode shows the practice election's fake reports. The actions on each
 * incident (verify, reject, follow up) come with the election-day queue in task E6.
 */
export default async function ElectionConsolePage({ searchParams }: { searchParams: Promise<{ mode?: string; trained?: string }> }) {
  const staff = await requireElectionStaff();
  const sp = await searchParams;
  const [live, upcoming] = await Promise.all([currentElection(), nextElection()]);
  // Until they pass the training check, moderators only see practice reports.
  const practice = sp.mode === "practice" || !staff.trained || !live;
  const incidents = await incidentsInScope(staff, practice ? "practice" : live!.id);
  const opens = upcoming
    ? new Date(upcoming.opens_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" })
    : null;

  return (
    <div className="flex flex-col gap-4">
      {practice && (
        <p className="rounded-lg bg-[var(--cv-status-ack-bg)] p-3 font-mono text-xs font-semibold text-[var(--cv-status-ack-fg)]">
          PRACTICE MODE · FAKE REPORTS · NOTHING HERE IS REAL OR PUBLIC
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Election</h1>
          <p className="text-sm text-muted">
            {ROLE_LABEL[staff.electionRole]} · {staff.areaName}
          </p>
        </div>
        {staff.trained && live && (
          <nav aria-label="Mode" className="flex gap-3 text-sm">
            <Link href="/admin/election" aria-current={!practice ? "page" : undefined}>
              {live.name}
            </Link>
            <Link href="/admin/election?mode=practice" aria-current={practice ? "page" : undefined}>
              Practice
            </Link>
          </nav>
        )}
      </div>

      {sp.trained && staff.trained && (
        <p role="status" className="rounded-lg bg-fill p-3 text-sm">
          You passed the training check. Practise here on fake reports until polling day.
        </p>
      )}
      {!staff.trained ? (
        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          <h2 className="font-semibold">Before polling day: the training check</h2>
          <p className="text-sm text-muted">
            Seven questions on how we moderate: ballots, safety, labels and neutrality. You&apos;ll see real reports once
            you pass. Until then you can practise on fake ones below.
          </p>
          <Link href="/admin/election/training" className="self-start font-semibold">
            Take the training check
          </Link>
        </div>
      ) : (
        !live && (
          <p className="text-sm text-muted">
            No election is taking reports right now{opens ? `; the next opens on ${opens}` : ""}. Practise on fake reports
            until then.
          </p>
        )
      )}

      {practice && <PracticeControls />}

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="p-3">Incident</th>
              <th className="p-3">Polling unit</th>
              <th className="p-3">Label</th>
              <th className="p-3">Senders</th>
              <th className="p-3">Last report</th>
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  {practice ? "No practice reports yet. Add some to practise." : "No reports in your area yet."}
                </td>
              </tr>
            ) : (
              incidents.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <span className={`mr-2 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${SEVERITY[i.severity]}`}>{i.severity}</span>
                    {i.category_label}
                  </td>
                  <td className="p-3">
                    {i.pu_name}
                    <div className="font-mono text-[11px] text-muted">
                      {i.pu_code} · {i.ward_name} · {i.lga_name}
                    </div>
                  </td>
                  <td className="p-3">{i.label}</td>
                  <td className="p-3">{i.sender_count}</td>
                  <td className="p-3">{time(i.last_reported_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
