import { t, type Locale } from "@civicvoice/i18n";
import { initialState, step, type BotState } from "../bot/machine";
import { toBotInput, type InboundMessage } from "../whatsapp/payload";

/**
 * wa_inbound job: one WhatsApp message → one step of the bot.
 * All I/O is injected so the handler is testable without WhatsApp or a database.
 */

/**
 * Stored per contact. `outbox` remembers the replies computed for recent
 * message ids, so a retried job (after a failed send) resends the same replies
 * instead of re-running the message against a conversation that has moved on.
 */
export interface Session {
  state: BotState;
  outbox: { id: string; replies: string[] }[];
}

const OUTBOX_SIZE = 10;

export interface WaDeps {
  hashContact(phone: string): string;
  loadSession(contactHash: string): Promise<Session | null>;
  saveSession(contactHash: string, session: Session): Promise<void>;
  createReport(input: {
    city: "lagos" | "fct";
    category: string;
    location: { lat: number; lng: number } | { text: string };
    description: string;
    phone: string;
    language: Locale;
  }): Promise<{ reportId: string; ref: string }>;
  enqueueMediaFetch(reportId: string, mediaId: string, mediaType: "image" | "audio"): Promise<void>;
  lookupStatus(ref: string, contactHash: string): Promise<{ status: string; note: string | null } | null>;
  send(to: string, body: string): Promise<void>;
  policeFormUrl: string;
}

const STATUS_WORDS: Record<string, string> = {
  received: "received, waiting for a moderator to check it",
  verified: "verified",
  forwarded: "forwarded to the agency",
  acknowledged: "acknowledged by the agency",
  in_progress: "being worked on",
  resolved: "marked resolved. Is it fixed? Reply YES or NOT YET",
  confirmed_fixed: "confirmed fixed",
  unconfirmed: "marked resolved, not confirmed",
  rejected: "not published",
  merged: "merged with a similar report",
};

export async function handleWaInbound(message: InboundMessage, deps: WaDeps): Promise<void> {
  const phone = message.from.startsWith("+") ? message.from : `+${message.from}`;
  const to = phone.replace(/^\+/, "");
  const contactHash = deps.hashContact(phone);
  const session = (await deps.loadSession(contactHash)) ?? { state: initialState(), outbox: [] };

  const already = session.outbox.find((o) => o.id === message.id);
  if (already) {
    for (const reply of already.replies) await deps.send(to, reply);
    return;
  }

  const result = step(session.state, toBotInput(message), deps.policeFormUrl);
  const replies = [...result.replies];
  const locale = result.state.locale;

  for (const effect of result.effects) {
    if (effect.type === "create_report") {
      const { reportId, ref } = await deps.createReport({
        city: effect.city,
        category: effect.category,
        location: effect.location,
        description: effect.description ?? "",
        phone,
        language: locale,
      });
      if (effect.media) await deps.enqueueMediaFetch(reportId, effect.media.mediaId, effect.media.mediaType);
      replies.push(t(locale, "bot.received", { ref }));
    } else if (effect.type === "lookup_status") {
      const found = await deps.lookupStatus(effect.ref, contactHash);
      replies.push(
        found
          ? t(locale, "bot.status", {
              ref: effect.ref,
              status: STATUS_WORDS[found.status] ?? found.status,
              note: found.note ? `\n"${found.note}"` : "",
            })
          : t(locale, "bot.notFound", { ref: effect.ref }),
      );
    }
  }

  // Save before sending: if a send fails, the retry finds this message in the
  // outbox and resends the same replies; effects (like creating a report) never run twice.
  await deps.saveSession(contactHash, {
    state: result.state,
    outbox: [{ id: message.id, replies }, ...session.outbox].slice(0, OUTBOX_SIZE),
  });
  for (const reply of replies) await deps.send(to, reply);
}
