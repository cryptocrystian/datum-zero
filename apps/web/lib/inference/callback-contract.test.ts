import { describe, it, expect } from "vitest";
import { validateInferenceCallback, isValidInferenceCallback, InferenceCallbackValidationError } from "@dz/adapters";

// A representative payload — the shape services/inference emits (build_callback_payload).
function sample() {
  return {
    ingestion_session_id: "s1",
    organization_id: "o1",
    model_version: "thermal-classifier-v1",
    media_asset: { full_storage_path: "s3://datum-zero-dev/master/e2e.tif", captured_at: "2026-07-05T18:00:00Z" },
    detection: {
      confidence_score: 0.968, metric_delta: 18.4, metric_unit: "CELSIUS_DELTA",
      bounding_box: [180, 120, 250, 190], class_label: "Cell",
      classification: "IEC TS 62446-3 Cat 2 — Cell: single hot cell — investigate at next scheduled maintenance.",
      standard_ref: "IEC TS 62446-3", radiometric: true, delta_provisional: false,
      latitude: "32.222780", longitude: "-110.974370", z_axis_offset: null,
      visual_crop_url: "s3://datum-zero-dev/v", analytics_crop_url: "s3://datum-zero-dev/a",
    },
  };
}

describe("inference→web callback contract (pinned schema)", () => {
  it("accepts the canonical payload the pipeline emits", () => {
    expect(() => validateInferenceCallback(sample())).not.toThrow();
    expect(isValidInferenceCallback(sample())).toBe(true);
  });

  it("fails closed when a required field is missing", () => {
    const p = sample() as Record<string, unknown>;
    delete p.model_version;
    expect(isValidInferenceCallback(p)).toBe(false);
    expect(() => validateInferenceCallback(p)).toThrow(InferenceCallbackValidationError);
  });

  it("fails closed when a field is RENAMED on either side (the whole point of pinning)", () => {
    const p = sample();
    (p.detection as Record<string, unknown>).confidence = (p.detection as Record<string, unknown>).confidence_score;
    delete (p.detection as Record<string, unknown>).confidence_score; // rename confidence_score → confidence
    expect(isValidInferenceCallback(p)).toBe(false); // unknown field + missing required
  });

  it("fails closed on a wrong-shape bounding_box", () => {
    const p = sample();
    (p.detection as Record<string, unknown>).bounding_box = [1, 2, 3]; // not 4 ints
    expect(isValidInferenceCallback(p)).toBe(false);
  });
});
