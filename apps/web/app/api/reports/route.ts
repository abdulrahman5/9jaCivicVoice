import { NextResponse, type NextRequest } from "next/server";
import { ReportSubmission } from "@civicvoice/validation";
import { submitWebReport } from "@/modules/issues/submit";
import { rateLimit } from "@/modules/rate-limit";
import { verifyTurnstile } from "@/modules/turnstile";

/** POST /api/reports: web report flow submission (wireframes 1.2–1.3). */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = await rateLimit(`report:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many reports from this connection. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const turnstileToken = (body as { turnstileToken?: string } | null)?.turnstileToken;
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
  }

  const parsed = ReportSubmission.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report", issues: parsed.error.issues }, { status: 422 });
  }

  const result = await submitWebReport(parsed.data);
  return NextResponse.json({ ref: result.ref, trackingToken: result.trackingToken }, { status: 201 });
}
