import { civicServiceClient } from "@civicvoice/db";
import { StatusPill } from "@/components/StatusPill";
import type { IssueStatus } from "@civicvoice/validation";

/**
 * Moderation queue (wireframe 3.1, PRD F6): oldest unverified reports first.
 * TODO: detail panel with verify / merge / reject / route actions, media
 * approval, triage suggestions and transcripts.
 */
export default async function ModerationQueuePage() {
  const { data, error } = await civicServiceClient()
    .schema("core")
    .from("issues")
    .select("id, ref_code, title, category, lga, status, created_at")
    .eq("status", "received")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;

  const rows = (data ?? []) as {
    id: string;
    ref_code: string;
    title: string;
    category: string;
    lga: string | null;
    status: IssueStatus;
    created_at: string;
  }[];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Moderation queue</h1>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="p-3">Report</th>
              <th className="p-3">LGA</th>
              <th className="p-3">Status</th>
              <th className="p-3">Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted">
                  Queue is empty.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <div className="font-semibold">{r.title}</div>
                    <div className="font-mono text-[11px] text-muted">
                      {r.ref_code} · {r.category}
                    </div>
                  </td>
                  <td className="p-3">{r.lga ?? "—"}</td>
                  <td className="p-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="p-3">{new Date(r.created_at).toLocaleString("en-NG")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
