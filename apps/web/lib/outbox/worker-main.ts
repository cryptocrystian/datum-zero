/**
 * Standalone entry for the outbox delivery worker. Run it as its own process:
 *   pnpm worker      (root script → tsx apps/web/lib/outbox/worker-main.ts)
 * In production this is a dedicated service; the Next app only ENQUEUES.
 */
import { startWorker } from "./worker";

const worker = startWorker();
// eslint-disable-next-line no-console
console.log("[outbox] work-order delivery worker started");

worker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error(`[outbox] job ${job?.id} failed: ${err.message}`);
});

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
