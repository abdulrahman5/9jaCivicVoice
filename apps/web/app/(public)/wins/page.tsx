import type { Metadata } from "next";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = { title: "Wins" };

/**
 * Wins feed (wireframe 4.3, PRD F10 · P1).
 * TODO: read public_read.wins (confirmed_fixed issues with approved before/after photos).
 */
export default function WinsPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex flex-1 flex-col gap-2 p-5">
        <p className="font-mono text-xs text-muted">WINS · CONFIRMED BY RESIDENTS</p>
        <h1 className="text-2xl font-bold">What got fixed this month</h1>
        <p className="mt-6 rounded-card border border-dashed border-line p-4 text-sm text-muted">
          Fixes appear here once residents confirm them.
        </p>
      </main>
      <BottomNav active="wins" />
    </div>
  );
}
