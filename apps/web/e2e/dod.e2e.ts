import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// --- env: DATABASE_URL/REDIS_URL from repo .env locally (CI sets them as job env); Jira/webhook MOCKED ---
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL / REDIS_URL.
}
process.env.INFERENCE_CALLBACK_TOKEN = "e2e-callback-token";
// Force the Jira adapter at a mock (overrides any real base URL from .env). No live HTTP.
process.env.JIRA_EMAIL = "e2e@datumzero.example";
process.env.JIRA_API_TOKEN = "e2e-token";

import { NextRequest } from "next/server";
import { prisma, runWithOrg, SpatialBindingStatus, QueueStatus } from "@dz/db";
import { validateWorkOrder } from "@dz/adapters";
import { POST as inferenceCallback } from "@/app/api/v1/inference/callback/route";
import { approveAnomaly } from "@/lib/qa/review";
import { getProvenance } from "@/lib/audit/provenance";
import { startWorker } from "@/lib/outbox/worker";
import { getDispatchQueue } from "@/lib/outbox/queue";
import type { Worker } from "bullmq";

// Seeded fixtures (scripts/seed).
const ORG = "00000000-0000-0000-0000-000000000001";
const WEBHOOK_INTEGRATION = "00000000-0000-0000-0000-000000000004";
const JIRA_INTEGRATION = "00000000-0000-0000-0000-000000000005";
const PILOT = "00000000-0000-0000-0000-000000000006";
const HW = "00000000-0000-0000-0000-000000000007";
const EXPECT_ASSET = "00000000-0000-0001-0002-000000000003"; // APEX_SOLAR-GRID_04-ROW_02-STR_03
const EXPECT_LABEL = "APEX_SOLAR-GRID_04-ROW_02-STR_03";
const VERIFIED_SERIAL = "DZ-THERMAL-0001";

// Seeded concierge reviewer (M1-01) — the authenticated identity that stamps the QA approval.
const REVIEWER = "00000000-0000-0000-0000-0000000000a1";

// e2e-transient rows.
const SESSION = "00000000-0000-0000-00e2-000000000001";
const MEDIA = "00000000-0000-0000-00e2-000000000002";

// Deterministic "sample" detection (on-grid, above the 10°C rule threshold).
const BBOX = [180, 120, 250, 190];
const LAT = "32.222780";
const LON = "-110.974370";
const VERDICT = /\b(violation|breach|back-?charge|penalty|liable|guilty)\b/i; // guardrail:allow-verdict-term

const webhookHits: any[] = [];
const jiraIssues: any[] = [];
let webhookSrv: http.Server;
let jiraSrv: http.Server;
let worker: Worker;
let originalWebhookConfig: unknown;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function poll(fn: () => Promise<boolean>, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(200); }
  return false;
}
const adfText = (d: any): string => {
  try { return (d.content ?? []).map((p: any) => (p.content ?? []).map((t: any) => t.text ?? "").join("")).join("\n"); } catch { return ""; }
};
async function cleanupRows() {
  // RLS-scoped: transient e2e rows belong to ORG (M1-02).
  await runWithOrg(ORG, async () => {
    await prisma.workOrderDispatch.deleteMany({ where: { anomaly: { mediaAssetId: MEDIA } } });
    await prisma.anomaly.deleteMany({ where: { mediaAssetId: MEDIA } });
    await prisma.mediaAsset.deleteMany({ where: { id: MEDIA } });
    await prisma.ingestionSession.deleteMany({ where: { id: SESSION } });
  });
}

beforeAll(async () => {
  // Mock the two delivery targets (localhost, in-process — no external HTTP).
  webhookSrv = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => { try { webhookHits.push(JSON.parse(raw)); } catch { /* */ } res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `WH-${webhookHits.length}` })); });
  });
  jiraSrv = http.createServer((req, res) => {
    if (req.method === "GET" && (req.url ?? "").includes("/issue/createmeta/")) {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ values: [{ id: "10001", name: "Task", subtask: false }] }));
      return;
    }
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => { try { jiraIssues.push(JSON.parse(raw)); } catch { /* */ } res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ key: `DZ-E2E-${jiraIssues.length}` })); });
  });
  await new Promise<void>((r) => webhookSrv.listen(0, r));
  await new Promise<void>((r) => jiraSrv.listen(0, r));
  const webhookPort = (webhookSrv.address() as AddressInfo).port;
  const jiraPort = (jiraSrv.address() as AddressInfo).port;
  process.env.JIRA_BASE_URL = `http://localhost:${jiraPort}`;

  await runWithOrg(ORG, async () => {
    const integ = await prisma.integration.findUnique({ where: { id: WEBHOOK_INTEGRATION }, select: { config: true } });
    originalWebhookConfig = integ?.config ?? {};
    await prisma.integration.update({ where: { id: WEBHOOK_INTEGRATION }, data: { config: { url: `http://localhost:${webhookPort}/webhook` } } });
  });

  await cleanupRows();
  worker = startWorker();
});

afterAll(async () => {
  if (worker) await worker.close();
  await getDispatchQueue().obliterate({ force: true }).catch(() => {});
  await cleanupRows();
  // Bulletproof ALS: await INSIDE the run callback so the GUC is set at query-execution time.
  await runWithOrg(ORG, async () => {
    await prisma.integration.update({ where: { id: WEBHOOK_INTEGRATION }, data: { config: (originalWebhookConfig ?? {}) as object } });
  }).catch(() => {});
  if (webhookSrv) await new Promise<void>((r) => webhookSrv.close(() => r()));
  if (jiraSrv) await new Promise<void>((r) => jiraSrv.close(() => r()));
  await prisma.$disconnect();
});

describe("M0 walking-skeleton — Definition of Done (end-to-end)", () => {
  it("runs seed → ingest → inference → bind → classify → approve → fan-out dispatch → audit", () =>
    // RLS org context for all direct-Prisma steps; the callback + worker set their own (M1-02).
    runWithOrg(ORG, async () => {
    // 1) INGEST — capture-time airframe binding (M0-04, CR-11). Fail closed on unverified.
    const { bindAirframe } = await import("@/lib/ingestion/airframe-binding");
    const airframe = await bindAirframe({ organizationId: ORG, airframeSerial: VERIFIED_SERIAL });
    expect(airframe.ok).toBe(true);
    if (!airframe.ok) return;
    expect(airframe.isNdaaVerified).toBe(true);

    await prisma.ingestionSession.create({
      data: { id: SESSION, organizationId: ORG, modality: "DRONE_THERMAL", pilotOrNodeId: airframe.pilotId, rawStoragePath: "s3://datum-zero-dev/raw/e2e.tif", boundHardwareId: airframe.hardwareId, isNdaaVerified: airframe.isNdaaVerified },
    });
    await prisma.mediaAsset.create({ data: { id: MEDIA, ingestionSessionId: SESSION, fullStoragePath: "s3://datum-zero-dev/master/e2e.tif", capturedAt: new Date("2026-07-05T18:00:00Z") } });

    // 2) INFERENCE — real detector result (proposer + classifier + ΔT) posted to the callback (DET-1b/1c).
    //    The callback persists the MODEL classification UNBOUND, then runs bind (M0-06) + client policy (DET-1c).
    const MODEL_CLASSIFICATION = "IEC TS 62446-3 Cat 2 — Cell: single hot cell — investigate at next scheduled maintenance.";
    const detectionPayload = {
      ingestion_session_id: SESSION,
      organization_id: ORG,
      model_version: "thermal-classifier-v1",
      media_asset: { full_storage_path: "s3://datum-zero-dev/master/e2e.tif", captured_at: "2026-07-05T18:00:00Z" },
      detection: {
        confidence_score: 0.968, metric_delta: 18.4, metric_unit: "CELSIUS_DELTA",
        bounding_box: BBOX, latitude: LAT, longitude: LON, z_axis_offset: null,
        // Model owns the type (CR-19): class + IEC category served through the callback (DET-1b).
        class_label: "Cell", iec_category: 2, priority: "SCHEDULED",
        classification: MODEL_CLASSIFICATION, standard_ref: "IEC TS 62446-3",
        detected_format: "RADIOMETRIC_TIFF",
        grounded_iec_category: 2, requires_safety_review: false,
        iec_normalization: "UNAVAILABLE", iec_provenance: "IEC TS 62446-3 (CD / pending verification)",
        radiometric: true, delta_provisional: false,
        visual_crop_url: "s3://datum-zero-dev/v", analytics_crop_url: "s3://datum-zero-dev/a",
      },
    };
    const cbReq = new NextRequest("http://localhost/api/v1/inference/callback", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.INFERENCE_CALLBACK_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(detectionPayload),
    });
    const cbRes = await inferenceCallback(cbReq);
    expect(cbRes.status).toBe(201);

    const anomaly = await prisma.anomaly.findFirstOrThrow({ where: { mediaAssetId: MEDIA }, select: { id: true, spatialBindingStatus: true, assetId: true, classification: true, standardRef: true, priority: true, recommendation: true, ruleSetId: true, status: true, modelVersion: true, iecCategory: true } });

    // 3) SPATIAL BIND (M0-06, CR-13)
    expect(anomaly.spatialBindingStatus).toBe(SpatialBindingStatus.BOUND);
    expect(anomaly.assetId).toBe(EXPECT_ASSET);

    // 4) CLASSIFY + POLICY (DET-1c, CR-12/CR-15 amend) — the MODEL owns the persisted classification
    //    (CR-19); the RuleSet applies client POLICY → priority + routing + evidence-framed recommendation.
    //    status stays PENDING_QA.
    expect(anomaly.classification).toBe(MODEL_CLASSIFICATION); // persisted verbatim from the model payload
    expect(anomaly.standardRef).toBe("IEC TS 62446-3");
    expect(anomaly.ruleSetId).toBeTruthy(); // client policy applied
    expect(anomaly.priority).toBe("SCHEDULED"); // model Cat 2 + ΔT 18.4°C (< 2× the 10°C knob) → SCHEDULED
    expect(anomaly.recommendation).toContain("Priority SCHEDULED");
    expect(anomaly.recommendation).not.toMatch(VERDICT); // evidence-framed
    expect(anomaly.status).toBe(QueueStatus.PENDING_QA);
    expect(anomaly.iecCategory).toBe(2); // M2-2a/CR-28: grounded objective Category persisted additively

    // 5) QA APPROVE (M0-08, CR-12) — 100% human gate; approval fans out via the guarded outbox
    await approveAnomaly(anomaly.id, ORG, REVIEWER);
    const approved = await prisma.anomaly.findUniqueOrThrow({ where: { id: anomaly.id }, select: { status: true, reviewedById: true, reviewedAt: true } });
    expect(approved.status).toBe(QueueStatus.APPROVED_DISPATCHED);
    expect(approved.reviewedById).toBe(REVIEWER);
    expect(approved.reviewedAt).toBeTruthy();

    // 6) DISPATCH FAN-OUT — routing is client POLICY (DET-1c): the RuleSet.routeTargets
    //    ["GENERIC_WEBHOOK","NATIVE_JIRA"] select exactly these two active integrations. Both mocked, via BullMQ.
    await poll(async () => (await prisma.workOrderDispatch.count({ where: { anomalyId: anomaly.id, isResolved: true } })) === 2);
    const dispatches = await prisma.workOrderDispatch.findMany({
      where: { anomalyId: anomaly.id },
      select: { id: true, integrationId: true, isResolved: true, lastStatus: true, downstreamRef: true, payload: true },
    });
    expect(dispatches.length).toBe(2);
    const webhook = dispatches.find((d) => d.integrationId === WEBHOOK_INTEGRATION);
    const jira = dispatches.find((d) => d.integrationId === JIRA_INTEGRATION);
    expect(webhook?.isResolved).toBe(true);
    expect(webhook?.lastStatus).toBe(200);
    expect(jira?.isResolved).toBe(true);
    expect(jira?.lastStatus).toBe(201);
    expect(jira?.downstreamRef).toMatch(/^DZ-E2E-/);

    // 7) PAYLOADS — both stored payloads are schema-valid; delivered artifacts are evidence-framed
    expect(() => validateWorkOrder(webhook?.payload)).not.toThrow();
    expect(() => validateWorkOrder(jira?.payload)).not.toThrow();

    expect(webhookHits.length).toBeGreaterThanOrEqual(1);
    expect(() => validateWorkOrder(webhookHits[0])).not.toThrow(); // webhook received the canonical payload
    expect(webhookHits[0].recommendation.text).not.toMatch(VERDICT); // evidence, not verdict

    expect(jiraIssues.length).toBeGreaterThanOrEqual(1);
    const issue = jiraIssues[0];
    expect(issue.fields.project.key).toBe("DZ");
    expect(issue.fields.issuetype.id).toBe("10001"); // resolved via createmeta
    expect(issue.fields.summary).not.toMatch(VERDICT);
    expect(adfText(issue.fields.description)).not.toMatch(VERDICT);

    // 8) AUDIT — one call reconstructs the full provenance chain for each dispatch (M0-11, CR-12)
    for (const d of dispatches) {
      const chain = await getProvenance(d.id, ORG);
      expect(chain, `provenance for ${d.id}`).not.toBeNull();
      if (!chain) continue;
      expect(chain.source.imagePath).toBe("s3://datum-zero-dev/master/e2e.tif");
      expect(chain.detection.modelVersion).toBe("thermal-classifier-v1");
      expect(chain.source.detectedFormat).toBe("RADIOMETRIC_TIFF"); // radiometric provenance (M2-1e/CR-27)
      // Provenance surfaces the raw stored confidence (0..1); the work-order payload presents 0..100.
      expect(chain.detection.confidenceScore).toBeCloseTo(0.968, 3);
      expect(chain.asset?.internalLabel).toBe(EXPECT_LABEL);
      expect(chain.ruleHit?.standardRef).toBe("IEC TS 62446-3");
      expect(chain.ruleHit?.classification).toContain("IEC TS 62446-3");
      expect(chain.review.reviewedById).toBe(REVIEWER);
      expect(chain.review.reviewedAt).toBeTruthy();
      expect(chain.timestamps.capturedAt).toBeTruthy();
      expect(chain.timestamps.detectedAt).toBeTruthy();
      expect(chain.timestamps.reviewedAt).toBeTruthy();
      expect(chain.timestamps.dispatchedAt).toBeTruthy();
      expect(chain.workOrder.downstreamRef).toBeTruthy();
    }

    // org-scoped: another org cannot read this dispatch's provenance
    const crossOrg = await getProvenance(dispatches[0].id, "00000000-0000-0000-0000-0000000000ff");
    expect(crossOrg).toBeNull();
    }));
});
