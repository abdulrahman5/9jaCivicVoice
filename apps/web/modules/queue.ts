import "server-only";
import { civicServiceClient } from "@civicvoice/db";

/** Queue names, matching the pgmq queues created in the civic migrations. */
export type QueueName =
  | "wa_inbound"
  | "media_fetch"
  | "transcribe"
  | "triage"
  | "notify_citizen"
  | "forward_agency"
  | "publish_media";

/**
 * Enqueues a job via ops.enqueue(), which is idempotent on idempotencyKey:
 * a webhook retried by Meta, or a double-submitted form, enqueues once.
 */
export async function enqueue(queue: QueueName, idempotencyKey: string, message: Record<string, unknown>) {
  const { data, error } = await civicServiceClient()
    .schema("ops")
    .rpc("enqueue", { p_queue: queue, p_idempotency_key: idempotencyKey, p_message: message });
  if (error) throw error;
  return data as boolean; // false when the key was already seen
}
