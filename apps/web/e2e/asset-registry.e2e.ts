import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL.
}
process.env.INFERENCE_CALLBACK_TOKEN = "e2e-registry-token";

import { NextRequest } from "next/server";
import { prisma, runWithOrg, SpatialBindingStatus } from "@dz/db";
import { POST as inferenceCallback } from "@/app/api/v1/inference/callback/route";
import { importAssetsCsv } from "@/lib/registry/asset-admin";

const ORG = "00000000-0000-0000-0000-000000000001";
const PILOT = "00000000-0000-0000-0000-000000000006";

// Unique label + coords far from the seeded APEX grid (~150 km) so binding is unambiguous to it.
const LABEL = "APEX_SOLAR-GRID_09-ROW_01-STR_01";
const LAT = "33.500000";
const LON = "-111.500000";
const SESSION = "00000000-0000-0000-00e4-000000000001";
const MEDIA = "00000000-0000-0000-00e4-000000000002";
const BBOX = [10, 10, 40, 40];

async function cleanup() {
  await runWithOrg(ORG, async () => {
    await prisma.workOrderDispatch.deleteMany({ where: { anomaly: { mediaAssetId: MEDIA } } });
    await prisma.anomaly.deleteMany({ where: { mediaAssetId: MEDIA } });
    await prisma.mediaAsset.deleteMany({ where: { id: MEDIA } });
    await prisma.ingestionSession.deleteMany({ where: { id: SESSION } });
    await prisma.asset.deleteMany({ where: { organizationId: ORG, internalLabel: LABEL } });
  });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("OPS-3 — a UI-imported registry asset spatially binds a detection at its coordinates", () => {
  it("rejects a bad CSV per-row, imports a valid one, and the detection binds to it", () =>
    runWithOrg(ORG, async () => {
      // 1) Bulk import validates every row: a non-CR-17 label imports NOTHING and reports the row.
      const bad = await importAssetsCsv(ORG, `internalLabel,latitude,longitude\nnot-canonical,33.5,-111.5`);
      expect(bad.imported).toBe(0);
      expect(bad.errors[0]).toMatchObject({ row: 2 });

      // 2) Import a valid registry row through the same DAL the cockpit action calls.
      const ok = await importAssetsCsv(ORG, `internalLabel,latitude,longitude,procore_location_id\n${LABEL},${LAT},${LON},2048`);
      expect(ok).toEqual({ imported: 1, errors: [] });
      const asset = await prisma.asset.findFirstOrThrow({ where: { organizationId: ORG, internalLabel: LABEL }, select: { id: true, latitude: true, longitude: true, procoreLocationId: true } });
      expect(Number(asset.latitude)).toBeCloseTo(33.5, 6);
      expect(asset.procoreLocationId).toBe(2048);

      // 3) A detection AT the imported asset's coordinates flows through the callback.
      await prisma.ingestionSession.create({ data: { id: SESSION, organizationId: ORG, modality: "HANDHELD_360_VIDEO", pilotOrNodeId: PILOT, rawStoragePath: "s3://datum-zero-dev/raw/ops3.mp4" } });
      await prisma.mediaAsset.create({ data: { id: MEDIA, ingestionSessionId: SESSION, fullStoragePath: "s3://datum-zero-dev/master/ops3.mp4", capturedAt: new Date("2026-07-07T18:00:00Z") } });

      const payload = {
        ingestion_session_id: SESSION,
        organization_id: ORG,
        model_version: "thermal-classifier-v1",
        media_asset: { full_storage_path: "s3://datum-zero-dev/master/ops3.mp4", captured_at: "2026-07-07T18:00:00Z" },
        detection: {
          confidence_score: 0.94, metric_delta: 12.0, metric_unit: "CELSIUS_DELTA",
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

      // 4) Spatial binding resolved the anomaly to the UI-imported asset (registry → binding, end to end).
      const anomaly = await prisma.anomaly.findFirstOrThrow({ where: { mediaAssetId: MEDIA }, select: { assetId: true, spatialBindingStatus: true } });
      expect(anomaly.spatialBindingStatus).toBe(SpatialBindingStatus.BOUND);
      expect(anomaly.assetId).toBe(asset.id);
    }));
});
