import type { Metadata } from "next";
import { City, type PoliceIncidentType } from "@civicvoice/validation";
import { policePatterns } from "@/modules/police-patterns/data";
import {
  BANDS,
  BAND_LABELS,
  areasByMonth,
  cellRect,
  forwardingSummary,
  mapCells,
  mapViewBox,
  monthLabel,
  type Band,
  type KindFilter,
} from "@/modules/police-patterns/shape";
import { POLICE_TYPE_LABELS, RECIPIENT_LABELS } from "@/modules/vault/labels";

export const metadata: Metadata = { title: "Police conduct patterns" };
export const revalidate = 3600;

const CITY = { lagos: "Lagos", fct: "FCT Abuja" } as const;
const KINDS: Record<KindFilter, string> = { all: "All reports", misconduct: "Misconduct", commendation: "Commendations" };

// Ordinal ramp for the count bands: documented sequential blue, steps 250/400/550/700,
// validated with the dataviz palette validator (--ordinal, light surface).
const BAND_FILL: Record<Band, string> = { "3-5": "#86b6ef", "6-10": "#3987e5", "11-25": "#1c5cab", "26+": "#0d366b" };
const SERIES_1 = "#2a78d6";

const typeLabel = (t: string) => POLICE_TYPE_LABELS[t as PoliceIncidentType] ?? t;
const osmLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Public police conduct patterns (docs/POLICE.md, section 5). Areas and bands only, never individual reports. */
export default async function PolicePatternsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; kind?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const city = City.catch("lagos").parse(sp.city);
  const kind: KindFilter = sp.kind === "misconduct" || sp.kind === "commendation" ? sp.kind : "all";
  const data = await policePatterns(city);
  const latest = data.periods.at(-1);
  const month = sp.month && data.periods.includes(sp.month) ? sp.month : latest;

  const ofKind = data.areas.filter((a) => kind === "all" || a.kind === kind);
  const cells = mapCells(ofKind.filter((a) => a.period_start === month));
  const box = mapViewBox(data.outlines, cells);
  const trend = areasByMonth(data.periods, ofKind);
  const trendMax = Math.max(1, ...trend.map((t) => t.areas));
  const recent = data.forwarding.filter((f) => data.periods.slice(-6).includes(f.period_start));
  const summaries = forwardingSummary(recent);
  const policeForm = process.env.NEXT_PUBLIC_POLICE_FORM_URL;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs text-muted">POLICE CONDUCT PATTERNS · UPDATED MONTHLY</p>
        <h1 className="text-3xl font-bold tracking-tight">Where police conduct is reported in {CITY[city]}</h1>
        <p className="text-muted">
          {latest
            ? `Published months: ${monthLabel(data.periods[0]!)} to ${monthLabel(latest)}. Individual reports are never shown.`
            : "No months have been published yet. Each month appears once it has ended."}
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 font-semibold">
          City
          <select name="city" defaultValue={city} className="h-11 rounded-lg border border-line bg-surface px-3 font-normal">
            {City.options.map((c) => (
              <option key={c} value={c}>
                {CITY[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Reports
          <select name="kind" defaultValue={kind} className="h-11 rounded-lg border border-line bg-surface px-3 font-normal">
            {(Object.keys(KINDS) as KindFilter[]).map((k) => (
              <option key={k} value={k}>
                {KINDS[k]}
              </option>
            ))}
          </select>
        </label>
        {data.periods.length > 0 && (
          <label className="flex flex-col gap-1 font-semibold">
            Month
            <select name="month" defaultValue={month} className="h-11 rounded-lg border border-line bg-surface px-3 font-normal">
              {[...data.periods].reverse().map((p) => (
                <option key={p} value={p}>
                  {monthLabel(p)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="h-11 rounded-card bg-accent px-4 font-semibold text-white">
          Show
        </button>
      </form>

      <Card title={month ? `Areas with 3 or more reports, ${monthLabel(month)}` : "Areas with 3 or more reports"}>
        {box && cells.length > 0 ? (
          <>
            <svg
              viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
              className="h-auto max-h-[520px] w-full rounded-lg bg-ground"
              role="img"
              aria-label={`Map of ${CITY[city]} with ${cells.length} areas shaded by number of reports. The same data is in the table below.`}
            >
              {data.outlines.map((o) => (
                <g key={o.name}>
                  <path d={o.svg_path} fill="var(--cv-surface)" stroke="var(--cv-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <text
                    x={o.label_lng}
                    y={-o.label_lat}
                    fontSize={box.width * 0.034}
                    textAnchor="middle"
                    fill="var(--cv-muted)"
                  >
                    {o.name}
                  </text>
                </g>
              ))}
              {cells.map((c) => {
                const r = cellRect(c.grid_cell);
                const detail = c.entries.map((e) => `${typeLabel(e.incident_type)}: ${BAND_LABELS[e.band]} reports`).join("\n");
                return (
                  <rect
                    key={c.grid_cell}
                    x={r.x}
                    y={r.y}
                    width={r.size}
                    height={r.size}
                    rx={r.size * 0.12}
                    fill={BAND_FILL[c.band]}
                    stroke="var(--cv-surface)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    tabIndex={0}
                    aria-label={`${c.lga ?? "Area"}, about 1 km: ${detail.replace(/\n/g, "; ")}`}
                    className="outline-none focus:opacity-80 hover:opacity-80"
                  >
                    <title>{`${c.lga ?? "Area"} · about 1 km\n${detail}`}</title>
                  </rect>
                );
              })}
            </svg>
            <ul className="flex flex-wrap items-center gap-4 text-sm text-muted" aria-label="Legend">
              <li className="text-ink">Reports of one type in an area that month:</li>
              {BANDS.map((b) => (
                <li key={b} className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: BAND_FILL[b] }} />
                  {BAND_LABELS[b]}
                </li>
              ))}
            </ul>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Show as a table</summary>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="p-2">Area (about 1 km)</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Reports</th>
                  </tr>
                </thead>
                <tbody>
                  {cells.flatMap((c) =>
                    c.entries.map((e, i) => (
                      <tr key={`${c.grid_cell}-${e.incident_type}`} className="border-b border-line last:border-0">
                        <td className="p-2">
                          {i === 0 && (
                            <a href={osmLink(c.lat, c.lng)} target="_blank" rel="noreferrer">
                              {c.lga ?? "Outside known LGAs"} ({c.lat}, {c.lng})
                            </a>
                          )}
                        </td>
                        <td className="p-2">
                          {typeLabel(e.incident_type)}
                          {e.kind === "commendation" && <span className="text-muted"> (commendation)</span>}
                        </td>
                        <td className="p-2">{BAND_LABELS[e.band]}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </details>
          </>
        ) : (
          <p className="text-muted">
            {month
              ? "No area reached 3 reports of one type this month, so there's nothing to show. That protects the people who did report."
              : "Nothing to show yet."}
          </p>
        )}
      </Card>

      {trend.length > 0 && (
        <Card title="Areas with 3 or more reports, by month">
          <ol className="flex flex-col gap-2">
            {trend.map((t) => (
              <li key={t.period} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm">
                <span className="text-muted">{monthLabel(t.period)}</span>
                <span className="flex items-center gap-2">
                  {t.areas > 0 && (
                    <span
                      aria-hidden
                      className="h-4 rounded-r"
                      style={{ width: `${(t.areas / trendMax) * 85}%`, background: SERIES_1 }}
                    />
                  )}
                  <span className="text-ink">{t.areas}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">Counts areas, not reports. {KINDS[kind]}.</p>
        </Card>
      )}

      <Card title="Did the police respond? Last 6 published months">
        <div className="grid gap-4 sm:grid-cols-2">
          {summaries.map((s) => (
            <div key={s.recipient} className="flex flex-col gap-1 rounded-lg bg-ground p-4">
              <p className="text-sm text-muted">{RECIPIENT_LABELS[s.recipient]}</p>
              <p className="text-5xl font-bold tracking-tight">{s.response_rate === null ? "—" : `${s.response_rate}%`}</p>
              <p className="text-sm">
                {s.forwarded === 0
                  ? "Nothing forwarded yet."
                  : `${s.responded} of ${s.forwarded} forwarded reports acknowledged or acted on · ${s.no_response} no response after 30 days · ${s.awaiting} waiting`}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Only reports whose reporters asked us to forward them, with identifying details removed. Commendations are
          included: we forward those too.
        </p>
      </Card>

      <Card title="How this works">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          <li>Reports are anonymous. We keep no phone number, account or IP address, and never show individual reports.</li>
          <li>Locations are rounded to areas of about 1 km before they&apos;re stored.</li>
          <li>An area appears only when it has at least 3 reports of the same type in a month.</li>
          <li>Numbers are shown as ranges, not exact counts.</li>
          <li>A month is published after it ends, and never changes afterwards.</li>
          <li>Trained moderators check each report is consistent before it counts; rejected reports are left out.</li>
          <li>Commendations of good police conduct are counted separately.</li>
        </ul>
      </Card>

      <footer className="flex flex-wrap justify-between gap-3 text-sm text-muted">
        <span>
          {policeForm ? (
            <a href={policeForm}>Report police conduct safely and anonymously</a>
          ) : (
            "Protected police reporting is coming soon."
          )}
        </span>
        <span>
          <strong className="text-ink">Not an emergency service.</strong> In danger right now? Call 112.
        </span>
      </footer>
    </main>
  );
}
