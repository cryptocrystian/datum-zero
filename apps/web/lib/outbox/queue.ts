import { Queue } from "bullmq";
import { DISPATCH_QUEUE, bullConnection } from "./redis";

let queue: Queue | undefined;

export function getDispatchQueue(): Queue {
  if (!queue) queue = new Queue(DISPATCH_QUEUE, { connection: bullConnection() });
  return queue;
}

/**
 * Enqueue one delivery. IDEMPOTENT: jobId = the deterministic dispatchId (derived from the
 * idempotencyKey), so re-enqueuing the same dispatch is a no-op. Retries 5xx/network with
 * exponential backoff (CR: resilient webhook delivery). (BullMQ jobIds may not contain ':'.)
 */
export async function enqueueDispatch(dispatchId: string): Promise<void> {
  await getDispatchQueue().add(
    "deliver",
    { dispatchId },
    {
      jobId: dispatchId,
      attempts: 6,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    },
  );
}
