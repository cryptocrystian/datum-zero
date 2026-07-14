import { Worker, UnrecoverableError, type Job } from "bullmq";
import { prisma, runWithOrg } from "@dz/db";
import { SESSION_INFERENCE_QUEUE } from "./inference-queue";
import { bullConnection } from "../outbox/redis";

/**
 * M2-7/CR-36 — the ingestion→inference worker: the hop that was missing. It consumes a
 * `session-inference` job, HTTP-POSTs the inference service (`/internal/process`, env-configured base
 * URL — container DNS in compose/ECS), and inference does its existing work + POSTs its callback to the
 * web (unchanged). Mirrors the outbox worker (BullMQ + runWithOrg for RLS).
 *
 * IDEMPOTENT: a replayed job for a COMPLETE session is a no-op (no duplicate anomalies; the callback
 * also upserts by a deterministic key). RETRIED: a transient inference failure throws → BullMQ backoff.
 * FAIL CLOSED + VISIBLE: exhausted retries → the session goes FAILED and is surfaced to the operator —
 * a capture must NEVER vanish into the queue.
 */
const INFERENCE_TIMEOUT_MS = Number(process.env.INFERENCE_TIMEOUT_MS ?? 60000);

function inferenceBaseUrl(): string {
  return (process.env.INFERENCE_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

interface JobData {
  ingestionSessionId: string;
  organizationId: string;
  latitude?: number | null;
  longitude?: number | null;
}

async function processSession(job: Job): Promise<void> {
  const { ingestionSessionId, organizationId, latitude, longitude } = job.data as JobData;
  return runWithOrg(organizationId, async () => {
    const session = await prisma.ingestionSession.findFirst({
      where: { id: ingestionSessionId, organizationId },
      select: {
        id: true,
        rawStoragePath: true,
        processingStatus: true,
        mediaAssets: { select: { capturedAt: true }, take: 1 },
      },
    });
    if (!session) throw new UnrecoverableError(`inference: session not found in org: ${ingestionSessionId}`);
    // Idempotent — a replay of an already-processed session does no work (no duplicate anomalies).
    if (session.processingStatus === "COMPLETE") return;

    await prisma.ingestionSession.updateMany({
      where: { id: ingestionSessionId, organizationId },
      data: { processingStatus: "PROCESSING" },
    });

    const capturedAt = session.mediaAssets[0]?.capturedAt ?? null;
    const body = JSON.stringify({
      ingestion_session_id: session.id,
      organization_id: organizationId,
      raw_storage_path: session.rawStoragePath,
      captured_at: capturedAt ? capturedAt.toISOString() : null,
      // The capture's own GPS → inference binds to the right asset (M2-7c), not the SAMPLE fallback.
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    });

    try {
      // Call inference with a bounded timeout; a timeout/unreachable/5xx is retryable (throws).
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), INFERENCE_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`${inferenceBaseUrl()}/internal/process`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        throw new Error(`inference returned ${res.status} for session ${ingestionSessionId}`);
      }

      // Inference decoded → detected → POSTed its callback synchronously (an Anomaly, or a data-quality
      // event on a fail-closed capture). Either way, inference RAN — mark COMPLETE.
      await prisma.ingestionSession.updateMany({
        where: { id: ingestionSessionId, organizationId },
        data: { processingStatus: "COMPLETE" },
      });
    } catch (err) {
      // Fail closed + VISIBLE on the LAST attempt: mark the session FAILED so a stuck capture is
      // observable in the cockpit — never silently dropped (M2-7/CR-36). Earlier attempts just rethrow
      // → BullMQ retries with backoff. `attemptsMade` is the count BEFORE this run (0 on the first).
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade + 1 >= maxAttempts) {
        await prisma.ingestionSession.updateMany({
          where: { id: ingestionSessionId, organizationId, processingStatus: { not: "COMPLETE" } },
          data: { processingStatus: "FAILED" },
        });
      }
      throw err; // let BullMQ record the failure (and retry until exhausted)
    }
  });
}

export function startInferenceWorker(): Worker {
  const worker = new Worker(SESSION_INFERENCE_QUEUE, (job) => processSession(job), {
    connection: bullConnection(),
    concurrency: 4,
  });

  // Observability only — the fail-closed FAILED transition happens deterministically inside the job.
  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[inference] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`);
  });

  return worker;
}
