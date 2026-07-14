import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterAll } from "vitest";

/**
 * M2-7c — the REAL-TRIGGER DoD, black-box against the composed stack (runs only in CI's `images` job,
 * after `docker compose up`). NO simulation, NO in-process worker: a fixture is POSTed to the
 * containerized web, and everything downstream happens inside containers —
 *
 *   web (upload) → Redis (session-inference) → worker container → inference container (container DNS)
 *   → inference decodes the real ΔT → callback to the web container → Anomaly in Postgres,
 *   then approve (100% QA gate) → outbox worker container → the webhook-sink container.
 *
 * That single path proves every inter-service link that breaks in ECS. The synthetic-callback shortcut
 * that hid the missing trigger for an entire project is retired (see post-callback-pipeline.e2e.ts for
 * the fast in-process pipeline test, which honestly starts at the callback).
 *
 * NOTE: there is no REST approve endpoint (approval is a cockpit server action), so the QA-gate call
 * runs in-process against the COMPOSED Postgres/Redis — the delivery it triggers still goes through the
 * containerized outbox worker to the sink container (the container-mesh link this step proves).
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

import { prisma, runWithOrg } from "@dz/db";
import { approveAnomaly } from "@/lib/qa/review";
import { validateWorkOrder } from "@dz/adapters";

const WEB = process.env.COMPOSED_WEB_URL ?? "http://localhost:3000";
const INGEST_TOKEN = process.env.INGEST_API_TOKEN ?? "local_dev_ingest_token";
const ORG = "00000000-0000-0000-0000-000000000001";
const REVIEWER = "00000000-0000-0000-0000-0000000000a1";
const WEBHOOK_INTEGRATION = "00000000-0000-0000-0000-000000000004";
const JIRA_INTEGRATION = "00000000-0000-0000-0000-000000000005";
const VERIFIED_SERIAL = "DZ-THERMAL-0001";
// The fixture's GPS = seeded asset ROW_01-STR_01 (NOT the inference SAMPLE fallback ROW_02-STR_03).
const EXPECT_LABEL = "APEX_SOLAR-GRID_04-ROW_01-STR_01";
const VERDICT = /\b(violation|breach|back-charge|penalty|liable|enforce)\b/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function poll<T>(fn: () => Promise<T | null>, ms = 90_000): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(1000);
  }
  return null;
}

async function upload(fixture: string): Promise<Response> {
  const bytes = await readFile(path.join(repoRoot, "apps/web/e2e/fixtures", fixture));
  const form = new FormData();
  form.set("modality", "DRONE_THERMAL");
  form.set("airframeSerial", VERIFIED_SERIAL);
  form.set("organizationId", ORG);
  form.set("capturedAt", "2026-07-05T18:00:00Z");
  form.set("file", new Blob([bytes], { type: "image/tiff" }), "capture.tiff");
  return fetch(`${WEB}/api/v1/ingestion/upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${INGEST_TOKEN}` },
    body: form,
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("real-trigger DoD against the composed stack (M2-7c, CR-36, CR-35)", () => {
  it("upload → containers → bound Anomaly with real ΔT → approve → outbox worker → sink", async () => {
    // 1) POST the EXIF fixture to the CONTAINERIZED web (black-box HTTP).
    const res = await upload("geotagged_radiometric.tiff");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ingestionSessionId: string; mediaAssetId: string | null };
    const { ingestionSessionId, mediaAssetId } = body;
    expect(ingestionSessionId).toBeTruthy();
    expect(mediaAssetId).toBeTruthy();

    // 2–5) The containerized worker consumes → calls the containerized inference → callback → Anomaly.
    const anomaly = await runWithOrg(ORG, () =>
      poll(async () => {
        const a = await prisma.anomaly.findFirst({
          where: { mediaAssetId: mediaAssetId!, organizationId: ORG },
          select: {
            id: true, spatialBindingStatus: true, iecCategory: true, metricDelta: true, metricUnit: true,
            detectedFormat: true, classification: true, status: true,
            asset: { select: { internalLabel: true } },
          },
        });
        return a && a.spatialBindingStatus === "BOUND" ? a : null;
      }),
    );
    expect(anomaly, "no bound anomaly produced by the containers").toBeTruthy();
    // Spatially bound FROM THE FIXTURE'S GPS (proves upload→worker→inference coord flow).
    expect(anomaly!.asset?.internalLabel).toBe(EXPECT_LABEL);
    // Real measurement + classification produced by the inference container (not simulated).
    expect(Number(anomaly!.metricDelta)).toBeGreaterThan(30); // fixture ΔT ≈ 35
    expect(anomaly!.metricUnit).toBe("CELSIUS_DELTA");
    expect(anomaly!.iecCategory).toBe(2);
    expect(anomaly!.detectedFormat).toBe("RADIOMETRIC_TIFF");
    expect(anomaly!.classification).toContain("Offline-Module");
    expect(anomaly!.classification).not.toMatch(VERDICT);
    expect(anomaly!.status).toBe("PENDING_QA");

    // Session reaches the terminal COMPLETE (the worker sets it just after the callback lands, and a
    // container restart can delay it) — poll for eventual consistency.
    const completed = await runWithOrg(ORG, () =>
      poll(async () => {
        const s = await prisma.ingestionSession.findFirst({
          where: { id: ingestionSessionId, organizationId: ORG },
          select: { processingStatus: true },
        });
        return s?.processingStatus === "COMPLETE" ? s : null;
      }, 30_000),
    );
    expect(completed?.processingStatus, "session did not reach COMPLETE").toBe("COMPLETE");

    // 6) Point the webhook integration at the sink container + retire the un-mockable Jira target, then
    //    approve (100% QA gate). Delivery fans out through the CONTAINERIZED outbox worker.
    await runWithOrg(ORG, async () => {
      await prisma.integration.updateMany({
        where: { id: WEBHOOK_INTEGRATION, organizationId: ORG },
        data: { config: { url: "http://sink:8080/webhook" } },
      });
      await prisma.integration.updateMany({
        where: { id: JIRA_INTEGRATION, organizationId: ORG },
        data: { isActive: false },
      });
      await approveAnomaly(anomaly!.id, ORG, REVIEWER);
    });

    const dispatch = await runWithOrg(ORG, () =>
      poll(async () => {
        const d = await prisma.workOrderDispatch.findFirst({
          where: { anomalyId: anomaly!.id, integrationId: WEBHOOK_INTEGRATION, isResolved: true },
          select: { id: true, isResolved: true, lastStatus: true, payload: true },
        });
        return d ?? null;
      }),
    );
    expect(dispatch, "outbox worker did not deliver to the sink").toBeTruthy();
    // The sink returned 2xx (delivery through container DNS), and the delivered payload is schema-valid
    // + evidence-framed (verdict-language guard).
    expect(() => validateWorkOrder(dispatch!.payload)).not.toThrow();
    expect(JSON.stringify(dispatch!.payload)).not.toMatch(VERDICT);
  });

  it("the NO-EXIF fixture fails closed at the completeness gate (no anomaly, never enqueued)", async () => {
    const res = await upload("no_exif_radiometric.tiff");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ingestionSessionId: string; dataQuality?: { status: string } };
    expect(body.dataQuality?.status).toBe("INCOMPLETE_CAPTURE_METADATA");
    // No MediaAsset, so no anomaly can ever be produced for this session (fail closed, M2-3a Part D).
    const asset = await runWithOrg(ORG, () =>
      prisma.mediaAsset.findFirst({ where: { ingestionSessionId: body.ingestionSessionId } }),
    );
    expect(asset).toBeNull();
  });
});
