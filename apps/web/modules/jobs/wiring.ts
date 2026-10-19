import "server-only";
import { civicServiceClient } from "@civicvoice/db";
import { hashContact } from "../contact-hash";
import { env } from "../env";
import { submitReport } from "../issues/submit";
import { enqueue, type QueueName } from "../queue";
import { sendText } from "../whatsapp/client";
import type { InboundMessage } from "../whatsapp/payload";
import type { Handler, Job, QueueStore } from "./runner";
import { handleWaInbound, type Session, type WaDeps } from "./wa-inbound";

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
    policeFormUrl: env("app").NEXT_PUBLIC_POLICE_FORM_URL,
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
