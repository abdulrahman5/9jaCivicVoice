import type { Metadata } from "next";
import Link from "next/link";
import { TrackElectionReport } from "./TrackElectionReport";

export const metadata: Metadata = { title: "Check an election report" };

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
      <Link href="/elections/report" className="text-sm">
        ← Report from your polling unit
      </Link>
      <h1 className="text-2xl font-bold">Check an election report</h1>
      <TrackElectionReport initialRef={ref ?? ""} />
    </main>
  );
}
