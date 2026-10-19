import Link from "next/link";
import { City } from "@civicvoice/validation";
import { StatusPill } from "@/components/StatusPill";
import { requireStaff } from "@/modules/auth";
import { QUEUE_TABS, queue, type QueueTab } from "@/modules/moderation/data";

const CITY = { lagos: "Lagos", fct: "FCT Abuja" } as const;

function age(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 36e5;
  return hours < 1 ? "<1h" : hours < 48 ? `${Math.floor(hours)}h` : `${Math.floor(hours / 24)}d`;
}

/** Moderation queue (wireframe 3.1, PRD F6): oldest first, by stage. */
export default async function ModerationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; city?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const tab: QueueTab = sp.tab && sp.tab in QUEUE_TABS ? (sp.tab as QueueTab) : "received";
  const city = City.safeParse(sp.city).success ? (sp.city as City) : undefined;
  const rows = await queue(tab, city);
  const href = (t: QueueTab, c = city) => `/admin?tab=${t}${c ? `&city=${c}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Moderation queue</h1>
        <nav aria-label="City" className="flex gap-3 text-sm">
          <Link href={href(tab, undefined)} aria-current={!city ? "page" : undefined}>
            All
          </Link>
          {City.options.map((c) => (
            <Link key={c} href={href(tab, c)} aria-current={city === c ? "page" : undefined}>
              {CITY[c]}
            </Link>
          ))}
        </nav>
      </div>

      <nav aria-label="Stage" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {(Object.keys(QUEUE_TABS) as QueueTab[]).map((t) => (
          <Link
            key={t}
            href={href(t)}
            aria-current={t === tab ? "page" : undefined}
            className={`px-3 py-2 no-underline ${t === tab ? "border-b-2 border-accent font-semibold text-ink" : "text-muted"}`}
          >
            {QUEUE_TABS[t].label}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="p-3">Report</th>
              <th className="p-3">Where</th>
              <th className="p-3">Status</th>
              <th className="p-3">Me too</th>
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
                    <Link href={`/admin/issues/${r.id}`} className="font-semibold text-ink">
                      {r.title}
                    </Link>
                    <div className="font-mono text-[11px] text-muted">{r.ref_code}</div>
                  </td>
                  <td className="p-3">
                    {r.lga ?? (r.location_text ? <span className="text-muted">&ldquo;{r.location_text}&rdquo;</span> : "—")}
                    <div className="text-[11px] text-muted">{CITY[r.city]}</div>
                  </td>
                  <td className="p-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="p-3">{r.metoo_count}</td>
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
