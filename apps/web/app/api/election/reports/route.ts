import { NextResponse, type NextRequest } from "next/server";
import { MAX_PHOTO_BYTES, stripJpegMetadata } from "@civicvoice/media";
import {
  ElectionReportError,
  electionReportStatus,
  removeElectionPhotos,
  storeElectionPhotos,
  submitElectionReport,
  webSenderHash,
} from "@/modules/election/report";
import { ElectionRef, ElectionReportInput } from "@/modules/election/schemas";
import { rateLimit } from "@/modules/rate-limit";
import { verifyTurnstile } from "@/modules/turnstile";

/**
 * POST /api/election/reports: a web election report (task E4). JSON, or multipart with
 * the report as JSON in a "report" field and up to 3 JPEG "photos", already blurred and
 * re-encoded on the phone; metadata is stripped again here.
 * GET  /api/election/reports?ref=EV-XXXXXXX: what the reporter may see about their report.
 */

const MAX_PHOTOS = 3;
const ipOf = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  // Per IP, generous: on election day many voters share a mobile network's IP. The database
  // also limits each device and refuses repeats.
  if (!(await rateLimit(`election-report:${ipOf(req)}`, { limit: 60, windowMs: 60 * 60 * 1000 })).allowed) {
    return json({ error: "Too many reports from this connection. Try again later." }, 429);
  }

  let fields: Record<string, unknown>;
  const photos: Uint8Array[] = [];
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      fields = JSON.parse(String(form.get("report") ?? ""));
      const files = form.getAll("photos");
      if (files.length > MAX_PHOTOS) return json({ error: `Add at most ${MAX_PHOTOS} photos.` }, 422);
      for (const file of files) {
        if (typeof file === "string" || file.size > MAX_PHOTO_BYTES) return json({ error: "A photo is too large." }, 422);
        const stripped = stripJpegMetadata(new Uint8Array(await file.arrayBuffer()));
        if (!stripped) return json({ error: "A photo couldn't be read. Remove it and try again." }, 422);
        photos.push(stripped);
      }
    } else {
      fields = await req.json();
    }
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const { turnstileToken, ...rest } = fields ?? {};
  const parsed = ElectionReportInput.safeParse(rest);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." }, 422);
  if (photos.length && !parsed.data.photosConfirmed) {
    return json({ error: "Confirm there are no ballot papers in your photos, and faces and number plates are blurred." }, 422);
  }
  if (!(await verifyTurnstile(typeof turnstileToken === "string" ? turnstileToken : undefined, ipOf(req)))) {
    return json({ error: "Verification failed. Please try again." }, 400);
  }

  let mediaKeys: string[] = [];
  try {
    mediaKeys = await storeElectionPhotos(photos);
    const result = await submitElectionReport({
      electionId: parsed.data.electionId,
      puCode: parsed.data.puCode,
      category: parsed.data.category,
      description: parsed.data.description,
      mediaKeys,
      channel: "web",
      senderHash: webSenderHash(parsed.data.deviceId),
    });
    return json(result, 201);
  } catch (e) {
    await removeElectionPhotos(mediaKeys).catch(() => {});
    if (e instanceof ElectionReportError) return json({ error: e.message }, e.status);
    return json({ error: "We couldn't save your report. Please try again in a moment." }, 502);
  }
}

export async function GET(req: NextRequest) {
  if (!(await rateLimit(`election-status:${ipOf(req)}`, { limit: 120, windowMs: 60_000 })).allowed) {
    return json({ error: "Too many lookups. Wait a minute and try again." }, 429);
  }
  const ref = ElectionRef.safeParse(req.nextUrl.searchParams.get("ref") ?? "");
  if (!ref.success) return json({ error: ref.error.issues[0]?.message ?? "Check the reference." }, 422);
  try {
    const status = await electionReportStatus(ref.data);
    return status ? json({ status }) : json({ error: "We couldn't find a report with that reference." }, 404);
  } catch {
    return json({ error: "Lookup failed. Try again in a moment." }, 502);
  }
}
