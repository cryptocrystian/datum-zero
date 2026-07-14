import { Queue } from "bullmq";
import { bullConnection } from "../outbox/redis";

/**
 * Ingestion→inference orchestration queue (M2-7/CR-36). The missing trigger: upload enqueues here, a
 * worker consumes and HTTP-calls the inference service. Queue-based, mirroring the outbox — an
 * inference run is slow (a flight's worth of frames), must be retryable (a transient failure must not
 * lose a capture), idempotent (no duplicate anomalies on replay), and needs backpressure. A direct
 * HTTP call from the upload route would fail all three.
 */
export const SESSION_INFERENCE_QUEUE = "session-inference";

let queue: Queue | undefined;

export function getInferenceQueue(): Queue {
  if (!queue) queue = new Queue(SESSION_INFERENCE_QUEUE, { connection: bullConnection() });
  return queue;
}

/**
 * Enqueue one session for inference. IDEMPOTENT: jobId = the ingestionSessionId, so re-enqueuing the
 * same session while its job is live is a no-op; an already-processed session is additionally guarded
 * by `processingStatus === COMPLETE` in the worker. Retries inference-unreachable/5xx with exponential
 * backoff, then fails closed to FAILED (surfaced). organizationId rides in the job data so the worker
 * binds the RLS org context (runWithOrg) BEFORE it reads the tenant-scoped session (M1-02, CR-20).
 */
export async function enqueueSessionInference(
  ingestionSessionId: string,
  organizationId: string,
): Promise<void> {
  await getInferenceQueue().add(
    "process",
    { ingestionSessionId, organizationId },
    {
      jobId: ingestionSessionId,
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    },
  );
}
