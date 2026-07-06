import { describe, it, expect } from "vitest";
import { toProvenance, type ProvenanceRow } from "./provenance";

function row(overrides: Partial<ProvenanceRow["anomaly"]> = {}): ProvenanceRow {
  return {
    id: "wod-1",
    downstreamRef: "DZ-5",
    idempotencyKey: "anom-1:integ-1",
    isResolved: true,
    lastStatus: 201,
    attempts: 1,
    createdAt: new Date("2026-07-06T04:00:00.000Z"),
    integration: { targetType: "NATIVE_JIRA", displayName: "Jira Cloud (M0 sandbox)" },
    anomaly: {
      id: "anom-1",
      confidenceScore: 96.8,
      metricDelta: 18.4,
      metricUnit: "CELSIUS_DELTA",
      modelVersion: "thermal-threshold-v0.1.0",
      classification: "IEC TS 62446-3 Cat 2 — thermal abnormality",
      standardRef: "IEC TS 62446-3",
      recommendation: "Measured +18.4°C delta vs. median; review recommended.",
      boundingBox: [180, 120, 250, 190],
      latitude: 32.22278,
      longitude: -110.97437,
      visualCropUrl: "s3://datum-zero-dev/v",
      analyticsCropUrl: "s3://datum-zero-dev/a",
      spatialBindingStatus: "BOUND",
      status: "APPROVED_DISPATCHED",
      reviewedById: "00000000-0000-0000-0000-0000000000a1",
      reviewedAt: new Date("2026-07-06T03:00:00.000Z"),
      createdAt: new Date("2026-07-06T02:00:00.000Z"),
      asset: { internalLabel: "APEX_SOLAR-GRID_04-ROW_02-STR_03", latitude: 32.22278, longitude: -110.97437 },
      ruleSet: {
        id: "rs-1",
        name: "Solar thermal — hot string (IEC TS 62446-3)",
        standardRef: "IEC TS 62446-3",
        standardVersion: "2017",
        triggerMetric: "Temp_Delta_Threshold",
        operator: ">=",
        thresholdValue: 10,
        version: 1,
      },
      mediaAsset: {
        id: "media-1",
        fullStoragePath: "s3://datum-zero-dev/org/x/capture.tif",
        capturedAt: new Date("2026-07-05T18:00:00.000Z"),
        ingestionSession: { id: "sess-1", modality: "DRONE_THERMAL", isNdaaVerified: true, boundHardwareId: "hw-1" },
      },
      ...overrides,
    },
  };
}

describe("audit provenance chain (M0-11, CR-12)", () => {
  it("reconstructs every link of the determination in one record", () => {
    const p = toProvenance(row());

    // source image
    expect(p.source.imagePath).toBe("s3://datum-zero-dev/org/x/capture.tif");
    expect(p.source.mediaAssetId).toBe("media-1");
    expect(p.source.modality).toBe("DRONE_THERMAL");
    expect(p.source.ndaaVerified).toBe(true);
    // model + metrics
    expect(p.detection.modelVersion).toBe("thermal-threshold-v0.1.0");
    expect(p.detection.confidenceScore).toBe(96.8);
    expect(p.detection.metricDelta).toBe(18.4);
    // the rule hit (ruleSet + standardRef + classification)
    expect(p.ruleHit?.ruleSetId).toBe("rs-1");
    expect(p.ruleHit?.standardRef).toBe("IEC TS 62446-3");
    expect(p.ruleHit?.classification).toBe("IEC TS 62446-3 Cat 2 — thermal abnormality");
    // reviewer
    expect(p.review.reviewedById).toBe("00000000-0000-0000-0000-0000000000a1");
    expect(p.review.reviewedAt).toBe("2026-07-06T03:00:00.000Z");
    // all timestamps
    expect(p.timestamps.capturedAt).toBe("2026-07-05T18:00:00.000Z");
    expect(p.timestamps.detectedAt).toBe("2026-07-06T02:00:00.000Z");
    expect(p.timestamps.reviewedAt).toBe("2026-07-06T03:00:00.000Z");
    expect(p.timestamps.dispatchedAt).toBe("2026-07-06T04:00:00.000Z");
    // downstream ref
    expect(p.workOrder.downstreamRef).toBe("DZ-5");
    expect(p.workOrder.targetType).toBe("NATIVE_JIRA");

    // completeness: no required leaf is undefined
    for (const key of ["source", "detection", "review", "timestamps", "workOrder"] as const) {
      for (const [k, v] of Object.entries(p[key])) {
        expect(v, `${key}.${k} must be present`).not.toBeUndefined();
      }
    }
  });

  it("handles an unclassified / unbound anomaly (nullable links) without dropping the chain", () => {
    const p = toProvenance(row({ ruleSet: null, asset: null, classification: null }));
    expect(p.ruleHit).toBeNull();
    expect(p.asset).toBeNull();
    // core provenance still intact
    expect(p.detection.modelVersion).toBe("thermal-threshold-v0.1.0");
    expect(p.source.imagePath).toContain("capture.tif");
    expect(p.timestamps.dispatchedAt).toBe("2026-07-06T04:00:00.000Z");
  });
});
