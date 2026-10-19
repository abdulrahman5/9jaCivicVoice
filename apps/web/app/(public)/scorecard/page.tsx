import type { Metadata } from "next";
import Link from "next/link";
import { City } from "@civicvoice/validation";
import { scorecard } from "@/modules/public-data";

export const metadata: Metadata = { title: "Scorecard" };
export const revalidate = 300;

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
const days = (v: number | null) => (v === null ? "—" : v < 1 ? "< 1" : String(Math.round(v)));

/** Public responsiveness scorecard (wireframe 3.3, PRD F8). */
export default async function ScorecardPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const city = City.catch("lagos").parse((await searchParams).city);
  const rows = await scorecard(city);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs text-muted">PUBLIC SCORECARD · UPDATED DAILY</p>
        <h1 className="text-3xl font-bold tracking-tight">
          How quickly do agencies in {city === "lagos" ? "Lagos" : "Abuja"} respond to citizens?
        </h1>
        <nav aria-label="City" className="flex gap-4 text-sm">
          <Link href="?city=lagos">Lagos</Link>
          <Link href="?city=fct">FCT Abuja</Link>
        </nav>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="p-3 font-semibold">Agency</th>
              <th className="p-3 font-semibold">Reports</th>
              <th className="p-3 font-semibold">Acknowledged ≤ 7 days</th>
              <th className="p-3 font-semibold">Median days to resolve</th>
              <th className="p-3 font-semibold">Citizen-confirmed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  Agencies appear here once they have at least 10 reports in the period.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.agency_name} className="border-b border-line last:border-0">
                  <td className="p-3 font-semibold">{r.agency_name}</td>
                  <td className="p-3">{r.reports}</td>
                  <td className="p-3">{pct(r.ack_within_7d_pct)}</td>
                  <td className="p-3">{days(r.median_days_to_resolve)}</td>
                  <td className="p-3">{pct(r.confirmed_pct)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap justify-between gap-3 text-sm text-muted">
        <span>Non-partisan. Methodology and raw data are public. Reporter identities are never published.</span>
        <span>
          <strong className="text-ink">Not an emergency service.</strong> For emergencies call 112.
        </span>
      </footer>
    </main>
  );
}
