import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterAll, beforeAll } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL / REDIS_URL.
}
// Fast, deterministic retries for the fail-closed case (read at enqueue time, so setting here is fine).
process.env.INFERENCE_MAX_ATTEMPTS = "2";
process.env.INFERENCE_BACKOFF_MS = "50";

import { prisma, runWithOrg } from "@dz/db";
import { enqueueSessionInference } from "@/lib/ingestion/inference-queue";
import { startInferenceWorker } from "@/lib/ingestion/inference-worker";
import type { Worker } from "bullmq";

/**
 * M2-7/CR-36 — the ingestion→inference worker in isolation: real BullMQ queue → real worker → an HTTP
 * call to a MOCK inference server (the real inference service is exercised end-to-end in dod.e2e).
 * Proves the worker consumes, calls inference, and drives processingStatus — including idempotency and
 * fail-closed-to-FAILED.
 */
const ORG = "00000000-0000-0000-0000-000000000001";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function poll(fn: () => Promise<boolean>, ms = 15000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
}

let inferSrv: http.Server;
let worker: Worker;
let inferMode: "ok" | "fail" = "ok";
let callCount = 0;
let lastBody: Record<string, unknown> | null = null;
const createdSessions: string[] = [];

async function makeSession(): Promise<string> {
  const s = await prisma.ingestionSession.create({
    data: {
      organizationId: ORG,
      modality: "DRONE_THERMAL",
      pilotOrNodeId: "node-test",
      rawStoragePath: "raw/inference-worker-test.tif",
      processingStatus: "PENDING",
    },
    select: { id: true },
  });
  createdSessions.push(s.id);
  return s.id;
}

async function statusOf(id: string): Promise<string | null> {
  const s = await prisma.ingestionSession.findFirst({ where: { id }, select: { processingStatus: true } });
  return s?.processingStatus ?? null;
}

beforeAll(async () => {
  inferSrv = http.createServer((req, res) => {
    callCount += 1;
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        lastBody = JSON.parse(raw || "{}");
      } catch {
        lastBody = null;
      }
      if (inferMode === "fail") {
        res.writeHead(500);
        res.end("inference boom");
        return;
      }
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ accepted: true }));
    });
  });
  await new Promise<void>((r) => inferSrv.listen(0, r));
  const port = (inferSrv.address() as AddressInfo).port;
  process.env.INFERENCE_BASE_URL = `http://127.0.0.1:${port}`;
  worker = startInferenceWorker();
});

afterAll(async () => {
  if (worker) await worker.close();
  await new Promise<void>((r) => inferSrv.close(() => r()));
  await runWithOrg(ORG, () => prisma.ingestionSession.deleteMany({ where: { id: { in: createdSessions } } }));
  await prisma.$disconnect();
});

describe("session-inference worker (M2-7/CR-36) — queue → worker → inference call", () => {
  it("consumes the job, calls inference, and marks the session COMPLETE", async () => {
    await runWithOrg(ORG, async () => {
      inferMode = "ok";
      const id = await makeSession();
      await enqueueSessionInference(id, ORG);
      expect(await poll(async () => (await statusOf(id)) === "COMPLETE")).toBe(true);
    });
  });

  it("forwards the capture's GPS to inference (so it binds to the right asset, not the fallback)", async () => {
    await runWithOrg(ORG, async () => {
      inferMode = "ok";
      const id = await makeSession();
      await enqueueSessionInference(id, ORG, { latitude: 32.222690, longitude: -110.974590 });
      expect(await poll(async () => (await statusOf(id)) === "COMPLETE")).toBe(true);
      expect(lastBody?.latitude).toBe(32.222690);
      expect(lastBody?.longitude).toBe(-110.974590);
      expect(lastBody?.raw_storage_path).toBe("raw/inference-worker-test.tif");
    });
  });

  it("is idempotent: re-enqueuing a COMPLETE session triggers no new inference call", async () => {
    await runWithOrg(ORG, async () => {
      inferMode = "ok";
      const id = await makeSession();
      await enqueueSessionInference(id, ORG);
      expect(await poll(async () => (await statusOf(id)) === "COMPLETE")).toBe(true);
      const before = callCount;
      await enqueueSessionInference(id, ORG);
      await sleep(600);
      expect(callCount).toBe(before); // no second call — no duplicate processing
      expect(await statusOf(id)).toBe("COMPLETE");
    });
  });

  it("fails closed + visible: inference unreachable → retries → FAILED (never stuck)", async () => {
    await runWithOrg(ORG, async () => {
      inferMode = "fail";
      const id = await makeSession();
      await enqueueSessionInference(id, ORG);
      expect(await poll(async () => (await statusOf(id)) === "FAILED", 20000)).toBe(true);
    });
  });
});
