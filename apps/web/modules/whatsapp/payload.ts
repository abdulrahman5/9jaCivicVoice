import { z } from "zod";

/**
 * The subset of the WhatsApp Cloud API webhook payload we use.
 * Unknown fields are allowed (Meta adds them often); unknown message types
 * are kept as "unsupported" so the bot can reply politely.
 */
const Message = z
  .object({
    id: z.string(),
    from: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    location: z.object({ latitude: z.number(), longitude: z.number(), name: z.string().optional() }).optional(),
    image: z.object({ id: z.string(), mime_type: z.string().optional() }).optional(),
    audio: z.object({ id: z.string(), mime_type: z.string().optional() }).optional(),
    interactive: z
      .object({
        button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
        list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      })
      .optional(),
  })
  .loose();

export const WebhookPayload = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z
            .object({
              messages: z.array(Message).optional(),
              statuses: z.array(z.unknown()).optional(),
            })
            .loose(),
        }),
      ),
    }),
  ),
});

export type InboundMessage = z.infer<typeof Message>;

/** Normalised input for the bot state machine. */
export type BotInput =
  | { kind: "text"; text: string }
  | { kind: "location"; lat: number; lng: number }
  | { kind: "media"; mediaType: "image" | "audio"; mediaId: string }
  | { kind: "button"; id: string }
  | { kind: "unsupported" };

export function extractMessages(payload: z.infer<typeof WebhookPayload>): InboundMessage[] {
  return payload.entry.flatMap((e) => e.changes.flatMap((c) => c.value.messages ?? []));
}

export function toBotInput(m: InboundMessage): BotInput {
  if (m.type === "text" && m.text) return { kind: "text", text: m.text.body };
  if (m.type === "location" && m.location) {
    return { kind: "location", lat: m.location.latitude, lng: m.location.longitude };
  }
  if (m.type === "image" && m.image) return { kind: "media", mediaType: "image", mediaId: m.image.id };
  if (m.type === "audio" && m.audio) return { kind: "media", mediaType: "audio", mediaId: m.audio.id };
  const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
  if (m.type === "interactive" && reply) return { kind: "button", id: reply.id };
  return { kind: "unsupported" };
}
