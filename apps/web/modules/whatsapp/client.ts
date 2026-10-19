import "server-only";
import { env } from "../env";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";

/**
 * Sends a free-form text reply. Only allowed within 24 hours of the citizen's
 * last message; later status updates must use approved templates (sendTemplate).
 */
export async function sendText(to: string, body: string): Promise<void> {
  await post({ messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: false } });
}

export async function sendTemplate(to: string, name: string, language: string, params: string[]): Promise<void> {
  await post({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
    },
  });
}

async function post(payload: Record<string, unknown>) {
  const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = env("whatsapp");
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // Never include the recipient number in errors: they end up in logs and Sentry.
    throw new Error(`WhatsApp send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
