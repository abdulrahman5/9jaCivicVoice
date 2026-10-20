import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/modules/auth";
import { isConfigured } from "@/modules/env";
import { POLICE_TABS, openPoliceReport, staffNames } from "@/modules/vault/data";
import { CITY_LABELS, OUTCOME_LABELS, POLICE_TYPE_LABELS, RECIPIENT_LABELS, WHEN_LABELS } from "@/modules/vault/labels";
import { ForwardTextForm, RejectForm, ReplyForm, StatusButton } from "./forms";

export const metadata: Metadata = { title: "Police report" };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

/** One police report (docs/POLICE.md, section 3). Rendering this page writes police.access_log. */
export default async function PoliceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  // Not found (rather than forbidden) for everyone else, so a report's existence isn't confirmed.
  if (staff.role !== "police_moderator" || !isConfigured("vault")) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const report = await openPoliceReport(id, staff.userId);
  if (!report) notFound();

  const names = await staffNames([
    ...report.access.map((a) => a.moderator_id),
    ...report.messages.flatMap((m) => (m.moderator_id ? [m.moderator_id] : [])),
  ]);
  const who = (moderatorId: string | null) => (moderatorId ? (names.get(moderatorId) ?? "Unknown moderator") : "");
  const open = report.status !== "closed" && report.status !== "rejected";
  const canForward = report.status === "consistent" || report.status === "forwarded";

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/admin/police?tab=${report.status}`} className="text-sm">
        ← Back to {POLICE_TABS[report.status].toLowerCase()}
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          {report.kind === "commendation" ? "Commendation" : "Misconduct"} · {CITY_LABELS[report.city]} · filed{" "}
          {fmt(report.created_at)}
        </p>
        <h1 className="text-2xl font-bold">{POLICE_TYPE_LABELS[report.incident_type]}</h1>
        <p className="text-sm">
          Status: <strong>{POLICE_TABS[report.status]}</strong>
          {report.reject_reason && <span className="text-muted"> · &ldquo;{report.reject_reason}&rdquo;</span>}
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
          <Panel title="Report">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Fact label="Place (as typed)">{report.place}</Fact>
              <Fact label="Approximate area">{report.grid_cell ? `~1 km cell ${report.grid_cell}` : "Not shared"}</Fact>
              <Fact label="When">
                {report.occurred_on ?? WHEN_LABELS[report.when_bucket]}
                {report.time_of_day && `, ${report.time_of_day}`}
              </Fact>
              <Fact label="Forwarding">{report.consent_to_forward ? "Reporter consented" : "No consent: don't forward"}</Fact>
              {report.kind === "misconduct" && (
                <Fact label="Legal aid">{report.wants_legal_aid ? "Asked for legal aid" : "Not requested"}</Fact>
              )}
              <Fact label="Photos">{report.media_count ? `${report.media_count} (viewing comes with photo upload)` : "None"}</Fact>
            </dl>
            <p className="whitespace-pre-wrap">{report.description || <em className="text-muted">No text</em>}</p>
            {report.officer_details && (
              <details className="rounded-lg bg-fill p-2 text-sm">
                <summary className="cursor-pointer font-semibold">Show officer details</summary>
                <p className="mt-2 whitespace-pre-wrap">{report.officer_details}</p>
                <p className="text-xs text-muted">Never published. Included only in what goes to the CRU and PSC.</p>
              </details>
            )}
          </Panel>

          <Panel title={`Messages (${report.messages.length})`}>
            {report.messages.length === 0 ? (
              <p className="text-sm text-muted">No messages yet.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {report.messages.map((m) => (
                  <li
                    key={m.id}
                    className={`max-w-[85%] rounded-card p-3 text-sm ${m.author === "reporter" ? "bg-fill" : "self-end bg-accent-soft"}`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      {m.author === "reporter" ? "Reporter" : who(m.moderator_id)} · {fmt(m.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {report.status !== "closed" ? (
              <ReplyForm reportId={report.id} />
            ) : (
              <p className="text-sm text-muted">Closed reports can&apos;t take new messages.</p>
            )}
          </Panel>

          <Panel title="Access log">
            <ol className="flex flex-col gap-1 text-sm">
              {report.access.map((a, i) => (
                <li key={i} className="text-muted">
                  {fmt(a.created_at)} · {who(a.moderator_id)} · {a.action.replace(/[:_]/g, " ")}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          {report.status === "new" && (
            <Panel title="Review">
              <p className="text-sm text-muted">
                Consistent means plausible, on topic, and not identifying a private person. We never call police reports
                &ldquo;verified&rdquo;.
              </p>
              <StatusButton reportId={report.id} status="consistent" label="Mark consistent" primary />
            </Panel>
          )}

          {canForward && report.consent_to_forward && (
            <Panel title="Forwarding copy">
              <ForwardTextForm reportId={report.id} initial={report.forward_text ?? report.description} />
              {!report.forward_text && <p className="text-xs text-muted">Not saved yet. It starts as the original text.</p>}
            </Panel>
          )}

          {report.forwards.length > 0 && (
            <Panel title="Forwarded to">
              <ul className="flex flex-col gap-2 text-sm">
                {report.forwards.map((f) => (
                  <li key={f.recipient}>
                    <strong>{RECIPIENT_LABELS[f.recipient]}</strong> via {f.channel}
                    {f.reference && ` (ref ${f.reference})`} · {fmt(f.forwarded_at)}
                    <div className="text-muted">{OUTCOME_LABELS[f.outcome]}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {(report.status === "new" || report.status === "consistent") && (
            <Panel title="Reject">
              <RejectForm reportId={report.id} />
            </Panel>
          )}

          {open && report.status !== "new" && (
            <Panel title="Close">
              <p className="text-sm text-muted">Closed reports are deleted 12 months later. Patterns are kept.</p>
              <StatusButton reportId={report.id} status="closed" label="Close report" />
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
