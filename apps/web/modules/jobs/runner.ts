import type { QueueName } from "../queue";

/**
 * Generic queue runner. Reads a batch, runs the handler for each message, and
 * acknowledges successes. A failed message becomes visible again after the
 * visibility timeout and is retried; after MAX_ATTEMPTS it moves to dead_letter.
 * Handlers must therefore be idempotent.
 */

export const MAX_ATTEMPTS = 5;

export interface Job {
  msg_id: number;
  read_ct: number;
  message: Record<string, unknown>;
}

export interface QueueStore {
  read(queue: QueueName, qty: number): Promise<Job[]>;
  ack(queue: QueueName, msgId: number): Promise<void>;
  deadLetter(queue: QueueName, msgId: number, error: string): Promise<void>;
}

export type Handler = (message: Record<string, unknown>) => Promise<void>;

export interface RunResult {
  queue: QueueName;
  processed: number;
  failed: number;
  deadLettered: number;
}

export async function runQueue(store: QueueStore, queue: QueueName, handler: Handler, batch = 10): Promise<RunResult> {
  const result: RunResult = { queue, processed: 0, failed: 0, deadLettered: 0 };
  for (const job of await store.read(queue, batch)) {
    try {
      await handler(job.message);
      await store.ack(queue, job.msg_id);
      result.processed++;
    } catch (err) {
      result.failed++;
      if (job.read_ct >= MAX_ATTEMPTS) {
        await store.deadLetter(queue, job.msg_id, err instanceof Error ? err.message : String(err));
        result.deadLettered++;
      }
    }
  }
  return result;
}
