import { NextResponse, type NextRequest } from "next/server";
import { env, isConfigured } from "@/modules/env";
import { enqueue } from "@/modules/queue";
import { WebhookPayload, extractMessages } from "@/modules/whatsapp/payload";
import { verifyMetaSignature } from "@/modules/whatsapp/signature";

/**
 * WhatsApp Cloud API webhook.
 * GET: Meta's one-time subscription handshake.
 * POST: verify signature → enqueue each message → 200, well under 1 second.
 * All conversation logic runs in the wa_inbound worker, never here.
 */

const notConfigured = () => new NextResponse("WhatsApp is not configured", { status: 503 });

export async function GET(req: NextRequest) {
  if (!isConfigured("whatsapp")) return notConfigured();
  const params = req.nextUrl.searchParams;
  const { WHATSAPP_VERIFY_TOKEN } = env("whatsapp");
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  if (!isConfigured("whatsapp")) return notConfigured();
  const rawBody = await req.text();
  const { WHATSAPP_APP_SECRET } = env("whatsapp");

  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), WHATSAPP_APP_SECRET)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const parsed = WebhookPayload.safeParse(json);
  if (!parsed.success) {
    // Acknowledge anyway: Meta retries non-2xx responses, and a payload we
    // can't parse won't parse on retry either.
    return NextResponse.json({ ok: true, ignored: true });
  }

  for (const message of extractMessages(parsed.data)) {
    // The raw number stays in the queue only until the worker has replied;
    // the worker deletes the message and stores a salted hash instead.
    await enqueue("wa_inbound", message.id, { message });
  }
  return NextResponse.json({ ok: true });
}
