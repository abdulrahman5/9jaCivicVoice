import type { Metadata } from "next";
import Link from "next/link";
import { isConfigured } from "@/modules/env";
import { currentElection, electionCategories, nextElection } from "@/modules/election/report";
import { ElectionReportFlow } from "./ElectionReportFlow";

export const metadata: Metadata = { title: "Report from your polling unit" };
export const dynamic = "force-dynamic";

const WAT = { timeZone: "Africa/Lagos" } as const;
const opensAt = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { ...WAT, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

/** Election-day reporting (task E4). Open only during an election's reporting window. */
export default async function ElectionReportPage() {
  const [election, upcoming, categories] = isConfigured("supabase")
    ? await Promise.all([currentElection(), nextElection(), electionCategories()])
    : [null, null, []];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
      <Link href="/" className="text-sm">
        ← Home
      </Link>
      {election ? (
        <ElectionReportFlow electionId={election.id} electionName={election.name} categories={categories} />
      ) : (
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">Election reporting isn&apos;t open yet</h1>
          <p className="text-[15px] text-muted">
            {upcoming
              ? `Reporting for the ${upcoming.name.toLowerCase()} opens on ${opensAt(upcoming.opens_at)}.`
              : "There's no election taking reports right now."}
          </p>
          <Link href="/elections/find" className="text-[15px] font-semibold">
            Find your polling unit
          </Link>
        </div>
      )}
    </main>
  );
}
