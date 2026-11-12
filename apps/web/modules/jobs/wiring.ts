import "server-only";
import { civicServiceClient } from "@civicvoice/db";
import { encryptContact } from "../contact-crypto";
import { hashContact, normalisePhone } from "../contact-hash";
import { lookup } from "../election/lookup";
import {
  ElectionReportError,
  currentElection,
  electionCategories,
  electionReportStatus,
  nextElection,
  submitElectionReport,
} from "../election/report";
import { env, siteUrl } from "../env";
import { submitReport } from "../issues/submit";
import { enqueue, type QueueName } from "../queue";
import { sendText } from "../whatsapp/client";
import type { InboundMessage } from "../whatsapp/payload";
import type { Handler, Job, QueueStore } from "./runner";
import { ReporterFacingError, handleWaInbound, type Session, type WaDeps } from "./wa-inbound";

/** Production wiring: real database, queues and WhatsApp behind the injectable interfaces. */

const ops = () => civicServiceClient().schema("ops");
const core = () => civicServiceClient().schema("core");

export const queueStore: QueueStore = {
  async read(queue, qty) {
    const { data, error } = await ops().rpc("read_jobs", { p_queue: queue, p_qty: qty, p_visibility_seconds: 60 });
    if (error) throw error;
    return (data ?? []) as Job[];
  },
  async ack(queue, msgId) {
    const { error } = await ops().rpc("ack_job", { p_queue: queue, p_msg_id: msgId });
    if (error) throw error;
  },
  async deadLetter(queue, msgId, message) {
    const { error } = await ops().rpc("dead_letter_job", { p_queue: queue, p_msg_id: msgId, p_error: message });
    if (error) throw error;
  },
};

/** The election context changes at most a few times a day; one read a minute is plenty for the bot. */
let electionCache: { at: number; value: Awaited<ReturnType<WaDeps["electionContext"]>> } | undefined;

async function electionContext(): ReturnType<WaDeps["electionContext"]> {
  if (electionCache && Date.now() - electionCache.at < 60_000) return electionCache.value;
  const [election, upcoming, categories] = await Promise.all([currentElection(), nextElection(), electionCategories()]);
  const opens = upcoming
    ? new Date(upcoming.opens_at).toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const value = {
    election: election ? { id: election.id, name: election.name, categories: categories.map(({ id, label }) => ({ id, label })) } : null,
    nextElectionNote: opens ? ` It opens on ${opens}.` : "",
    electionWebUrl: `${siteUrl()}/elections/report`,
  };
  electionCache = { at: Date.now(), value };
  return value;
}

function waDeps(): WaDeps {
  const pepper = env("secrets").CONTACT_HASH_PEPPER;
  return {
    hashContact: (phone) => hashContact(phone, pepper),
    async loadSession(contactHash) {
      const { data } = await ops().from("bot_sessions").select("state").eq("contact_hash", contactHash).maybeSingle();
      return (data?.state as Session | undefined) ?? null;
    },
    async saveSession(contactHash, session) {
      const { error } = await ops()
        .from("bot_sessions")
        .upsert({ contact_hash: contactHash, state: session, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async createReport(input) {
      const result = await submitReport({
        ...input,
        category: input.category as Parameters<typeof submitReport>[0]["category"],
        subcategory: "other", // the moderator refines it; the bot keeps the conversation short
        channel: "whatsapp",
      });
      return { reportId: result.reportId, ref: result.ref };
    },
    async enqueueMediaFetch(reportId, mediaId, mediaType) {
      await enqueue("media_fetch", `media:${mediaId}`, { report_id: reportId, media_id: mediaId, media_type: mediaType });
    },
    async lookupStatus(ref, contactHash) {
      const { data: issue } = await core().from("issues").select("id, status").eq("ref_code", ref).maybeSingle();
      if (!issue) return null;
      // Unpublished reports are only shown to the person who sent them.
      if (["received", "rejected"].includes(issue.status)) {
        const { data: own } = await core()
          .from("reports")
          .select("id")
          .eq("issue_id", issue.id)
          .eq("contact_hash", contactHash)
          .limit(1);
        if (!own?.length) return null;
      }
      const { data: last } = await core()
        .from("status_events")
        .select("public_note")
        .eq("issue_id", issue.id)
        .not("public_note", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { status: issue.status, note: last?.public_note ?? null };
    },
    send: sendText,
    policeFormUrl: env("police").NEXT_PUBLIC_POLICE_FORM_URL,
    electionContext,
    async findUnit(code) {
      const result = await lookup({ mode: "code", code });
      const unit = "unit" in result ? result.unit : null;
      return unit ? { code: unit.code, name: unit.name, active: unit.active, lga: unit.lga.name, state: unit.state.name } : null;
    },
    async createElectionReport(input) {
      try {
        return await submitElectionReport({
          electionId: input.electionId,
          puCode: input.puCode,
          category: input.category,
          description: input.description,
          mediaKeys: [],
          channel: "whatsapp",
          // The same hash as the bot session, so limits and duplicates follow the person.
          senderHash: input.contactHash,
          contactHash: input.contactHash,
          // Kept (encrypted) for moderators' follow-up questions, as with civic reports.
          contactEnc: encryptContact(normalisePhone(input.phone), env("secrets").CONTACT_ENC_KEY),
        });
      } catch (e) {
        if (e instanceof ElectionReportError) throw new ReporterFacingError(e.message);
        throw e;
      }
    },
    async electionStatus(ref) {
      const s = await electionReportStatus(ref);
      return s ? { category: s.category_label, unit: `${s.pu_name} (${s.pu_code})`, label: s.label } : null;
    },
  };
}

/**
 * Queues with a handler today. The others (media_fetch, transcribe, triage,
 * notify_citizen, forward_agency, publish_media) accumulate until their
 * handlers land; nothing is lost, and the health check only alerts on wa_inbound.
 */
export function handlers(): Partial<Record<QueueName, Handler>> {
  const deps = waDeps();
  return {
    wa_inbound: async (m) => handleWaInbound((m as { message: InboundMessage }).message, deps),
  };
}
