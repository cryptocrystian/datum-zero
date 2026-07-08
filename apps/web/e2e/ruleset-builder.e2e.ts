import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// --- env: DATABASE_URL from repo .env locally (CI sets it as job env) ---
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL / REDIS_URL.
}
process.env.INFERENCE_CALLBACK_TOKEN = "e2e-ruleset-token";

import { NextRequest } from "next/server";
import { prisma, runWithOrg, SpatialBindingStatus, QueueStatus } from "@dz/db";
import { POST as inferenceCallback } from "@/app/api/v1/inference/callback/route";
import { createRuleSet } from "@/lib/rules/ruleset-admin";
import { approveAnomaly } from "@/lib/qa/review";

const ORG = "00000000-0000-0000-0000-000000000001";
const WEBHOOK_INTEGRATION = "00000000-0000-0000-0000-000000000004";
const JIRA_INTEGRATION = "00000000-0000-0000-0000-000000000005";
const PILOT = "00000000-0000-0000-0000-000000000006";
const REVIEWER = "00000000-0000-0000-0000-0000000000a1";
const EXPECT_ASSET = "00000000-0000-0001-0002-000000000003";

// Isolated e2e rows (distinct modality DRONE_ORTHOMOSAIC so we never collide with the seed's
// DRONE_THERMAL policy or the dod e2e).
const SESSION = "00000000-0000-0000-00e3-000000000001";
const MEDIA = "00000000-0000-0000-00e3-000000000002";
const BBOX = [181, 121, 251, 191];
const LAT = "32.222780";
const LON = "-110.974370";

let authoredRuleSetId: string | null = null;

async function cleanup() {
  await runWithOrg(ORG, async () => {
    await prisma.workOrderDispatch.deleteMany({ where: { anomaly: { mediaAssetId: MEDIA } } });
    await prisma.anomaly.deleteMany({ where: { mediaAssetId: MEDIA } });
    await prisma.mediaAsset.deleteMany({ where: { id: MEDIA } });
    await prisma.ingestionSession.deleteMany({ where: { id: SESSION } });
    await prisma.ruleSet.deleteMany({ where: { organizationId: ORG, targetModality: "DRONE_ORTHOMOSAIC" } });
  });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("OPS-1 — a UI-authored RuleSet drives the pipeline's routing + priority", () => {
  it("authors a policy via the DAL, then the pipeline applies its escalation + routing", () =>
    runWithOrg(ORG, async () => {
      // 1) AUTHOR a client policy through the same DAL the cockpit server action calls.
      //    routeTargets = webhook ONLY (not Jira); threshold 5°C so an 18.4°C ΔT escalates to PROMPT.
      const authored = await createRuleSet(ORG, {
        name: "Orthomosaic — aggressive escalation",
        targetModality: "DRONE_ORTHOMOSAIC",
        triggerMetric: "Temp_Delta_Threshold",
        operator: ">=",
        thresholdValue: 5,
        routeTargets: ["GENERIC_WEBHOOK"],
        standardRef: "IEC TS 62446-3",
        standardVersion: "2017",
        isTemplate: false,
      });
      authoredRuleSetId = authored.id;
      expect(authored.version).toBeGreaterThanOrEqual(1);

      // 2) INGEST (DRONE_ORTHOMOSAIC) + a model-classified detection.
      await prisma.ingestionSession.create({
        data: { id: SESSION, organizationId: ORG, modality: "DRONE_ORTHOMOSAIC", pilotOrNodeId: PILOT, rawStoragePath: "s3://datum-zero-dev/raw/ops1.tif" },
      });
      await prisma.mediaAsset.create({ data: { id: MEDIA, ingestionSessionId: SESSION, fullStoragePath: "s3://datum-zero-dev/master/ops1.tif", capturedAt: new Date("2026-07-06T18:00:00Z") } });

      const payload = {
        ingestion_session_id: SESSION,
        organization_id: ORG,
        model_version: "thermal-classifier-v1",
        media_asset: { full_storage_path: "s3://datum-zero-dev/master/ops1.tif", captured_at: "2026-07-06T18:00:00Z" },
        detection: {
          confidence_score: 0.968, metric_delta: 18.4, metric_unit: "CELSIUS_DELTA",
          bounding_box: BBOX, latitude: LAT, longitude: LON, z_axis_offset: null,
          class_label: "Cell", iec_category: 2, priority: "SCHEDULED",
          classification: "IEC TS 62446-3 Cat 2 — Cell: single hot cell — investigate at next scheduled maintenance.",
          standard_ref: "IEC TS 62446-3", radiometric: true, delta_provisional: false,
          visual_crop_url: "s3://datum-zero-dev/v", analytics_crop_url: "s3://datum-zero-dev/a",
        },
      };
      const res = await inferenceCallback(new NextRequest("http://localhost/api/v1/inference/callback", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.INFERENCE_CALLBACK_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      }));
      expect(res.status).toBe(201);

      // 3) The AUTHORED policy drove classification-policy: bound, escalated to PROMPT, linked to it.
      const anomaly = await prisma.anomaly.findFirstOrThrow({
        where: { mediaAssetId: MEDIA },
        select: { id: true, spatialBindingStatus: true, assetId: true, ruleSetId: true, priority: true, classification: true, standardRef: true, status: true },
      });
      expect(anomaly.spatialBindingStatus).toBe(SpatialBindingStatus.BOUND);
      expect(anomaly.assetId).toBe(EXPECT_ASSET);
      expect(anomaly.ruleSetId).toBe(authored.id);                 // the UI-authored policy was applied
      expect(anomaly.priority).toBe("PROMPT");                     // ΔT 18.4 ≥ 2×5°C → escalated (authored threshold)
      expect(anomaly.classification).toContain("IEC TS 62446-3");  // model still owns the type (CR-19)
      expect(anomaly.status).toBe(QueueStatus.PENDING_QA);         // policy never advances the queue (CR-12)

      // 4) APPROVE → dispatch fan-out honors the authored routeTargets (webhook ONLY, no Jira).
      await approveAnomaly(anomaly.id, ORG, REVIEWER);
      const dispatches = await prisma.workOrderDispatch.findMany({ where: { anomalyId: anomaly.id }, select: { integrationId: true } });
      const targets = dispatches.map((d) => d.integrationId).sort();
      expect(targets).toEqual([WEBHOOK_INTEGRATION]);              // routing = the authored policy's routeTargets
      expect(targets).not.toContain(JIRA_INTEGRATION);
    }));
});
