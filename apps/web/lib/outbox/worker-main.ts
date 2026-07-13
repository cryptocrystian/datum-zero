/**
 * Standalone entry for the outbox delivery worker. Run it as its own process:
 *   pnpm worker      (root script → tsx apps/web/lib/outbox/worker-main.ts)
 * In production this is a dedicated service; the Next app only ENQUEUES.
 *
 * The outbound Jira call runs HERE, so this process must load the secret env itself (mirrors
 * dev:infer's --env-file). Secrets live in git-ignored env files: .env.local takes precedence, then
 * .env (where the dev Jira creds live). Both are optional — with neither, the live Jira path stays
 * token-gated. (DATABASE_URL comes from packages/db/.env via Prisma; REDIS_URL defaults.)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRuntimeRoleNotSuperuser } from "@dz/db";
import { startWorker } from "./worker";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// .env.local first so it wins; then .env fills anything not already set.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(repoRoot, file));
  } catch {
    // File absent — fine.
  }
}

// Fail closed (M2-6a, CR-35): refuse to start if the runtime DB role is a superuser — a collapsed
// dual-role would silently disable RLS tenant isolation. Migrations run separately via directUrl.
await assertRuntimeRoleNotSuperuser();

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
