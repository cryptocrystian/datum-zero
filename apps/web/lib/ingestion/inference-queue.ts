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
export interface CaptureCoords {
  latitude: number | null;
  longitude: number | null;
}

export async function enqueueSessionInference(
  ingestionSessionId: string,
  organizationId: string,
  coords?: CaptureCoords,
): Promise<void> {
  // Retry policy is env-configurable (an ops knob; tests set it low to fail fast). Defaults: 5
  // attempts, 2s exponential backoff — rides out a transient inference blip, bounded so a genuinely
  // unreachable service surfaces as FAILED rather than retrying forever. Read here (not module load)
  // so it stays dynamic.
  const attempts = Number(process.env.INFERENCE_MAX_ATTEMPTS ?? 5);
  const backoffMs = Number(process.env.INFERENCE_BACKOFF_MS ?? 2000);
  await getInferenceQueue().add(
    "process",
    // The capture's own GPS (from EXIF at upload) rides in the job so inference binds to the RIGHT
    // asset (M2-7c) — not the SAMPLE fallback. null when absent (inference falls back).
    { ingestionSessionId, organizationId, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null },
    {
      jobId: ingestionSessionId,
      attempts,
      backoff: { type: "exponential", delay: backoffMs },
      removeOnComplete: 1000,
      removeOnFail: false,
    },
  );
}
