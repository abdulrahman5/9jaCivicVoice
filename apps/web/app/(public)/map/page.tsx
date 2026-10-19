import type { Metadata } from "next";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = { title: "Issue map" };

/**
 * Public issue map (wireframe 1.5, PRD F9 · P1).
 * TODO: MapLibre GL + OpenStreetMap tiles, clustered points from public_read.issues_feed.
 */
export default function MapPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex flex-1 items-center justify-center p-8 text-center text-muted">
        The public issue map is coming in the first month after launch.
      </main>
      <BottomNav active="map" />
    </div>
  );
}
