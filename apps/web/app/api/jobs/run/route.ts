import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env, isConfigured } from "@/modules/env";
import { runQueue } from "@/modules/jobs/runner";
import { handlers, queueStore } from "@/modules/jobs/wiring";
import type { QueueName } from "@/modules/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/jobs/run: the queue worker. Called every minute by pg_cron
 * (ops.invoke_worker via pg_net) with the JOBS_SECRET bearer token.
 */
export async function POST(req: NextRequest) {
  if (!isConfigured("jobs")) return new NextResponse("Jobs not configured", { status: 503 });

  const expected = Buffer.from(`Bearer ${env("jobs").JOBS_SECRET}`);
  const received = Buffer.from(req.headers.get("authorization") ?? "");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = [];
  for (const [queue, handler] of Object.entries(handlers()) as [QueueName, NonNullable<ReturnType<typeof handlers>[QueueName]>][]) {
    results.push(await runQueue(queueStore, queue, handler));
  }
  return NextResponse.json({ ok: true, results });
}
