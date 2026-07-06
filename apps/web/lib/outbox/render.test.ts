import { describe, it, expect } from "vitest";
import {
  renderWorkOrder,
  validateWorkOrder,
  isValidWorkOrder,
  type RenderContext,
} from "@dz/adapters";

function ctx(overrides: Partial<RenderContext["anomaly"]> = {}): RenderContext {
  return {
    dispatchId: "00000000-0000-0000-00d9-00000000000a",
    idempotencyKey: "anom-1:integ-1",
    organizationId: "00000000-0000-0000-0000-000000000001",
    emittedAt: "2026-07-06T00:00:00.000Z",
    anomaly: {
      latitude: 32.22278,
      longitude: -110.97437,
      confidenceScore: 0.968,
      metricDelta: 18.4,
      metricUnit: "CELSIUS_DELTA",
      classification: "IEC TS 62446-3 Cat 2 — thermal abnormality",
      recommendation:
        "Measured +18.4°C delta vs. median (confidence 96.8%); classified IEC TS 62446-3 Cat 2 — thermal abnormality. Review recommended vs. IEC TS 62446-3 2017.",
      standardRef: "IEC TS 62446-3",
      modelVersion: "thermal-threshold-v0.1.0",
      reviewedById: "stub-qa-reviewer",
      reviewedAt: "2026-07-06T00:00:00.000Z",
      boundingBox: [180, 120, 250, 190],
      visualCropUrl: "s3://datum-zero-dev/org/x/visual_crop.bin",
      analyticsCropUrl: "s3://datum-zero-dev/org/x/analytics_crop.bin",
      ...overrides,
    },
    asset: { internalLabel: "APEX_SOLAR-GRID_04-ROW_02-STR_03", latitude: 32.22278, longitude: -110.97437 },
    capture: { modality: "DRONE_THERMAL", capturedAt: "2026-07-05T18:00:00.000Z", ndaaVerified: true, ingestionSessionId: "sess-1" },
  };
}

describe("work order render + schema validation (M0-09, CR-05, CR-12)", () => {
  it("renders a schema-valid payload for a classified anomaly", () => {
    expect(() => validateWorkOrder(renderWorkOrder(ctx()))).not.toThrow();
  });

  it("confidence is expressed 0..100", () => {
    const p = renderWorkOrder(ctx()) as { finding: { confidence_score: number } };
    expect(p.finding.confidence_score).toBe(96.8);
  });

  it("bound-but-unclassified anomaly still gets a schema-valid evidence recommendation (never null)", () => {
    const p = renderWorkOrder(ctx({ classification: null, recommendation: null, metricDelta: 6.2 })) as {
      recommendation: { text: string };
    };
    expect(p.recommendation.text).toContain("review recommended");
    expect(p.recommendation.text.length).toBeGreaterThan(0);
    expect(() => validateWorkOrder(p)).not.toThrow();
  });

  it("rejects verdict language via the schema pattern", () => {
    const bad = renderWorkOrder(ctx()) as { recommendation: { text: string } };
    bad.recommendation.text = "contractual violation confirmed — penalty and back-charge apply"; // guardrail:allow-verdict-term
    expect(isValidWorkOrder(bad)).toBe(false);
  });
});
