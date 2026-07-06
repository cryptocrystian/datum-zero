import { Worker, DelayedError, UnrecoverableError, type Job } from "bullmq";
import { prisma, runWithOrg } from "@dz/db";
import { getAdapter, validateWorkOrder } from "@dz/adapters";
import { DISPATCH_QUEUE, getRedis, bullConnection } from "./redis";

// Rate limit: ≤5 delivery requests per second per ORG token (MANIFEST §3).
const RATE_MAX = 5;
const RATE_WINDOW_MS = 1000;

/** Fixed 1s window per org. Returns ms to wait if the org is over budget, else 0. */
async function orgRateLimitWaitMs(organizationId: string): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const windowStart = Math.floor(now / RATE_WINDOW_MS);
  const key = `dz:rl:${organizationId}:${windowStart}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.pexpire(key, RATE_WINDOW_MS * 2);
  if (n > RATE_MAX) return (windowStart + 1) * RATE_WINDOW_MS - now;
  return 0;
}

async function processJob(job: Job, token?: string): Promise<void> {
  const { dispatchId, organizationId } = job.data as { dispatchId: string; organizationId: string };
  // Bind the RLS org context for the whole job — the dispatch row is invisible without it (M1-02).
  return runWithOrg(organizationId, () => deliver(job, token, dispatchId));
}

async function deliver(job: Job, token: string | undefined, dispatchId: string): Promise<void> {
  const dispatch = await prisma.workOrderDispatch.findUnique({
    where: { id: dispatchId },
    select: {
      id: true,
      organizationId: true,
      payload: true,
      isResolved: true,
      integration: { select: { targetType: true, config: true, secretVaultKey: true } },
    },
  });
  if (!dispatch) throw new UnrecoverableError(`dispatch not found: ${dispatchId}`);
  if (dispatch.isResolved) return; // idempotent — already delivered

  // Per-org rate limit — defer (not fail) if over budget so we never exceed ≤5/s per org.
  const waitMs = await orgRateLimitWaitMs(dispatch.organizationId);
  if (waitMs > 0) {
    await job.moveToDelayed(Date.now() + waitMs, token);
    throw new DelayedError();
  }

  const adapter = getAdapter(dispatch.integration.targetType);
  if (!adapter) throw new UnrecoverableError(`no adapter for ${dispatch.integration.targetType}`);

  // Validate the stored payload against the JSON Schema before sending (defense-in-depth).
  validateWorkOrder(dispatch.payload);

  const result = await adapter.deliver(dispatch.payload, {
    config: dispatch.integration.config,
    secretVaultKey: dispatch.integration.secretVaultKey,
  });
  const attempts = job.attemptsMade + 1;

  if (result.ok) {
    await prisma.workOrderDispatch.update({
      where: { id: dispatchId },
      data: { isResolved: true, lastStatus: result.status, downstreamRef: result.downstreamRef, attempts, retryAfter: null },
    });
    return;
  }

  await prisma.workOrderDispatch.update({
    where: { id: dispatchId },
    data: { lastStatus: result.status, attempts },
  });

  if (result.retryable) {
    // Throw → BullMQ retries with exponential backoff.
    throw new Error(`delivery failed status=${result.status} (retryable)`);
  }
  // Hard client rejection — do not retry.
  throw new UnrecoverableError(`delivery rejected status=${result.status}`);
}

export function startWorker(): Worker {
  return new Worker(DISPATCH_QUEUE, (job, token) => processJob(job, token), {
    connection: bullConnection(),
    concurrency: RATE_MAX,
  });
}
