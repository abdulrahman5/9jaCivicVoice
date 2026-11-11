import type { Metadata } from "next";
import Link from "next/link";
import { FindUnit } from "./FindUnit";

export const metadata: Metadata = { title: "Find your polling unit" };

/** "Find your polling unit" (task E3): the polling-unit lookup on its own, for any voter. */
export default function FindPollingUnitPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
      <Link href="/" className="text-sm">
        ← Home
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Find your polling unit</h1>
        <p className="text-[14px] text-muted">
          Use the code on your voter&apos;s card, choose from the lists, search by name, or look near you.
        </p>
      </div>
      <FindUnit />
      <p className="text-[12px] text-muted">
        Polling-unit list from INEC&apos;s voter registration portal; locations are approximate. Always follow INEC&apos;s
        official notices about where to vote.
      </p>
    </main>
  );
}
