import { t, type Locale } from "@civicvoice/i18n";
import { initialState, step, type BotContext, type BotState, type BotUnit, type Effect } from "../bot/machine";
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
  // Election reporting (task E4)
  /** The election taking reports now and its categories, plus the note for when none is open. */
  electionContext(): Promise<Pick<BotContext, "election" | "nextElectionNote" | "electionWebUrl">>;
  findUnit(code: string): Promise<BotUnit | null>;
  /** Throws an Error whose message is safe to show the reporter when the report is refused. */
  createElectionReport(input: {
    electionId: string;
    puCode: string;
    category: string;
    description: string;
    phone: string;
    contactHash: string;
  }): Promise<{ ref: string; label: string }>;
  electionStatus(ref: string): Promise<{ category: string; unit: string; label: string } | null>;
}

/** Reporter-facing words for an election incident's label. */
const ELECTION_LABEL_WORDS: Record<string, string> = {
  reported: "Received. It counts in your LGA and state totals.",
  corroborated: "Others at this polling unit reported the same thing.",
  verified: "A moderator has checked it.",
  rejected: "Not published.",
};

/** Shown when an election report is refused for a reason the reporter can act on. */
export class ReporterFacingError extends Error {}

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

  const ctx: BotContext = { policeFormUrl: deps.policeFormUrl, ...(await deps.electionContext()) };
  let result = step(session.state, toBotInput(message), ctx);
  const replies = [...result.replies];
  const locale = result.state.locale;

  // Effects can lead to another step (a polling-unit lookup answers the machine), so this is a queue.
  const pending: Effect[] = [...result.effects];
  for (let effect = pending.shift(); effect; effect = pending.shift()) {
    if (effect.type === "lookup_unit") {
      const unit = await deps.findUnit(effect.code);
      result = step(result.state, { kind: "unit_result", code: effect.code, unit }, ctx);
      replies.push(...result.replies);
      pending.push(...result.effects);
    } else if (effect.type === "create_election_report") {
      try {
        const { ref, label } = await deps.createElectionReport({
          electionId: effect.electionId,
          puCode: effect.puCode,
          category: effect.category,
          description: effect.description,
          phone,
          contactHash,
        });
        replies.push(
          t(locale, "bot.electionReceived", { ref, corroborated: label === "corroborated" ? t(locale, "bot.electionCorroborated") : "" }),
        );
      } catch (e) {
        if (!(e instanceof ReporterFacingError)) throw e;
        replies.push(e.message);
      }
    } else if (effect.type === "lookup_status" && effect.ref.startsWith("EV-")) {
      const found = await deps.electionStatus(effect.ref);
      replies.push(
        found
          ? t(locale, "bot.electionStatus", {
              ref: effect.ref,
              category: found.category,
              unit: found.unit,
              label: ELECTION_LABEL_WORDS[found.label] ?? found.label,
            })
          : t(locale, "bot.notFound", { ref: effect.ref }),
      );
    } else if (effect.type === "create_report") {
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
