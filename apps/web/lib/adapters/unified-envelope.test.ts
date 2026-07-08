import { describe, it, expect } from "vitest";
import { renderWorkOrderFromEnvelope, validateWorkOrder, isValidWorkOrder, type UnifiedAnomalyPayload } from "@dz/adapters";

// A representative envelope with EVERY optional field populated (incl. enterprise-only extras).
function envelope(): UnifiedAnomalyPayload {
  return {
    systemHeaders: { datumZeroId: "wo_1", organizationId: "org_1", idempotencyKey: "idem_1", timestamp: "2026-07-05T18:00:00Z" },
    assetContext: {
      internalLabel: "APEX_SOLAR-GRID_04-ROW_12-STR_08",
      procoreLocationId: 1024,
      externalSystemMappings: [{ targetPlatform: "maintainx", externalId: "mtx_984210" }],
    },
    spatialReference: { latitude: 32.22278, longitude: -110.97437, elevationOffset: 3.2, projectionPolygon: '{"type":"Polygon"}' },
    findingData: {
      modality: "DRONE_THERMAL",
      standardRef: "IEC TS 62446-3",
      classification: "Thermal abnormality — Category 2",
      confidenceScore: 96.8,
      metricDeltaValue: 18.4,
      metricUnit: "CELSIUS_DELTA",
      boundingBox: [180, 120, 250, 190],
      priority: "PROMPT",
      recommendedAction: "INSPECT",
      evidenceSummary: "Measured +18.4°C delta vs. median at 96.8% confidence; review recommended.",
      visualCropUrl: "https://s3.example/crops/v.jpg",
      analyticsCropUrl: "https://s3.example/crops/a.jpg",
    },
    auditProvenance: {
      capturedAt: "2026-07-05T18:00:00Z",
      modelVersion: "thermal-classifier-v1",
      reviewedById: "rev_1",
      reviewedAt: "2026-07-05T19:00:00Z",
      ingestionSessionId: "sess_1",
      ndaaVerified: true,
    },
    // Enterprise-only extras — the generic adapter MUST ignore these (Guard A).
    targetHints: { maximoWorktype: "EM", sapCostCenter: "CC-42" },
  };
}

describe("UnifiedAnomalyPayload → work-order.schema.json (the reconciled single contract)", () => {
  it("renders to a payload that validates against the canonical output schema (lossless superset)", () => {
    const out = renderWorkOrderFromEnvelope(envelope());
    expect(isValidWorkOrder(out)).toBe(true);
    expect(() => validateWorkOrder(out)).not.toThrow();
  });

  it("maps every field per §3.1", () => {
    const out = renderWorkOrderFromEnvelope(envelope()) as any;
    expect(out.schema_version).toBe("1.0");
    expect(out.work_order_id).toBe("wo_1");
    expect(out.finding.confidence_score).toBe(96.8); // direct (already 0–100)
    expect(out.finding.bounding_box).toEqual([180, 120, 250, 190]);
    expect(out.recommendation.recommended_action).toBe("INSPECT");
    expect(out.recommendation.priority_hint).toBe("HIGH"); // PROMPT → HIGH
    expect(out.asset.external_ids).toEqual({ maintainx: "mtx_984210", procore_location_id: 1024 });
    expect(out.audit.ndaa_verified).toBe(true);
    expect(out.audit.reviewed_by).toBe("rev_1");
  });

  it("Guard A: the generic adapter IGNORES targetHints + enterprise-only spatial fields", () => {
    const serialized = JSON.stringify(renderWorkOrderFromEnvelope(envelope()));
    for (const leaked of ["targetHints", "maximoWorktype", "sapCostCenter", "elevationOffset", "projectionPolygon"]) {
      expect(serialized.includes(leaked), `${leaked} must not appear in the generic payload`).toBe(false);
    }
  });

  it("priority enum maps MONITOR→LOW, SCHEDULED→MEDIUM, PROMPT→HIGH", () => {
    const p = (pr: "MONITOR" | "SCHEDULED" | "PROMPT") => {
      const e = envelope();
      e.findingData.priority = pr;
      return (renderWorkOrderFromEnvelope(e) as any).recommendation.priority_hint;
    };
    expect([p("MONITOR"), p("SCHEDULED"), p("PROMPT")]).toEqual(["LOW", "MEDIUM", "HIGH"]);
  });

  it("a minimal envelope (no optional extras) still validates", () => {
    const e = envelope();
    delete e.assetContext.procoreLocationId;
    delete e.assetContext.externalSystemMappings;
    delete e.targetHints;
    const out = renderWorkOrderFromEnvelope(e) as any;
    expect(isValidWorkOrder(out)).toBe(true);
    expect(out.asset.external_ids).toBeUndefined(); // omitted when empty
  });
});
