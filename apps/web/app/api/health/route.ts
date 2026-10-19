import { NextResponse } from "next/server";
import { civicServiceClient } from "@civicvoice/db";
import { isConfigured } from "@/modules/env";

export const dynamic = "force-dynamic";

/**
 * Uptime and queue health for the monitor (architecture doc, "Observability").
 * Returns 503 when the database is unreachable or a queue is stuck.
 */
export async function GET() {
  if (!isConfigured("supabase")) {
    return NextResponse.json({ ok: true, db: "not_configured" });
  }

  const { data, error } = await civicServiceClient().schema("ops").rpc("queue_health");
  if (error) {
    return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
  }

  const queues = (data ?? []) as { queue_name: string; depth: number; oldest_age_seconds: number | null }[];
  const stuck = queues.filter(
    (q) =>
      (q.queue_name === "wa_inbound" && (q.oldest_age_seconds ?? 0) > 120) ||
      (q.queue_name === "dead_letter" && q.depth > 0),
  );
  return NextResponse.json({ ok: stuck.length === 0, queues }, { status: stuck.length ? 503 : 200 });
}
