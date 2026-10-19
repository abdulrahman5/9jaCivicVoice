import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { requireStaff } from "@/modules/auth";
import { agenciesFor, duplicates, issueDetail } from "@/modules/moderation/data";
import { EditForm, MergeForm, NewLinkForm, RejectForm, RouteForm, VerifyForm } from "./forms";

export const metadata: Metadata = { title: "Review issue" };

const CITY = { lagos: "Lagos", fct: "FCT Abuja" } as const;
const fmt = (iso: string) => new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Issue review (wireframe 3.1 detail panel). */
export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const issue = await issueDetail(id);
  if (!issue) notFound();

  const editable = issue.status === "received" || issue.status === "verified";
  const [dupes, agencies] = editable ? await Promise.all([duplicates(issue), agenciesFor(issue)]) : [[], []];
  const located = issue.lat !== null && issue.lng !== null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin" className="text-sm">
        ← Back to queue
      </Link>

      <header className="flex flex-col gap-2">
        <p className="font-mono text-sm text-muted">
          {issue.ref_code} · {CITY[issue.city]} · received {fmt(issue.created_at)}
        </p>
        <h1 className="text-2xl font-bold">{issue.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusPill status={issue.status} />
          <span>Me too · {issue.metoo_count}</span>
          {issue.agency && <span>Agency: {issue.agency.name}</span>}
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
          <Panel title={`Reports (${issue.reports.length})`}>
            <ul className="flex flex-col gap-3">
              {issue.reports.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
                  <p className="text-xs text-muted">
                    {r.channel === "whatsapp" ? "WhatsApp" : "Web"} · {fmt(r.created_at)}
                    {r.since && ` · since ${r.since.replace(/_/g, " ")}`} · {r.language}
                    {r.has_contact ? " · wants updates" : " · anonymous, no updates"}
                  </p>
                  <p className="whitespace-pre-wrap">{r.description || <em className="text-muted">No text</em>}</p>
                  {r.transcript && (
                    <p className="rounded-lg bg-fill p-2 text-sm">
                      <span className="font-mono text-xs text-muted">VOICE NOTE TRANSCRIPT </span>
                      {r.transcript}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Location">
            <p className="text-sm">
              {located ? (
                <>
                  {issue.lga ?? "Unknown LGA"}
                  {issue.ward && ` · ${issue.ward}`} ·{" "}
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${issue.lat}&mlon=${issue.lng}#map=17/${issue.lat}/${issue.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open map ({issue.lat?.toFixed(4)}, {issue.lng?.toFixed(4)})
                  </a>
                </>
              ) : (
                <>
                  Typed by the reporter: <strong>&ldquo;{issue.location_text}&rdquo;</strong>. Find it on a map and enter
                  the coordinates below before routing.
                </>
              )}
            </p>
            {editable && (
              <EditForm
                issueId={issue.id}
                category={issue.category}
                subcategory={issue.subcategory}
                lat={issue.lat}
                lng={issue.lng}
              />
            )}
          </Panel>

          <Panel title="History">
            <ol className="flex flex-col gap-2 text-sm">
              {issue.events.map((e, i) => (
                <li key={i} className="border-l-2 border-accent pl-3">
                  <span className="font-semibold">{e.to_status.replace(/_/g, " ")}</span>{" "}
                  <span className="text-muted">
                    by {e.actor_type} · {fmt(e.created_at)}
                  </span>
                  {e.public_note && <p className="text-muted">&ldquo;{e.public_note}&rdquo;</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          {editable ? (
            <>
              <Panel title="Verify & route">
                <RouteForm
                  issueId={issue.id}
                  agencies={agencies}
                  disabledReason={located ? undefined : "Add the coordinates first (Location panel)."}
                />
                {issue.status === "received" && <VerifyForm issueId={issue.id} />}
              </Panel>
              <Panel title={dupes.length ? `Possible duplicates (${dupes.length})` : "Merge as duplicate"}>
                <MergeForm issueId={issue.id} suggestions={dupes} />
              </Panel>
              <Panel title="Reject">
                <RejectForm issueId={issue.id} />
              </Panel>
            </>
          ) : (
            issue.agency && (
              <Panel title="Agency link">
                <p className="text-sm text-muted">
                  Email this to {issue.agency.name} so they can reply without an account. You can create another if
                  they lose it or it expires.
                </p>
                <NewLinkForm issueId={issue.id} />
              </Panel>
            )
          )}
        </aside>
      </div>
    </div>
  );
}
