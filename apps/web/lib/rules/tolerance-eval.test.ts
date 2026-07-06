import { describe, it, expect } from "vitest";
import { buildRecommendation, classify, classifyDelta } from "./tolerance-eval";

// The verdict-language guard (mirrors tests/guardrails). Defining it here needs the literal terms.
const VERDICT = /\b(violation|breach|back[- ]?charge|penalty|liable|guilty)\b/i; // guardrail:allow-verdict-term

describe("recommendation generator is evidence-framed, never a verdict (CR-12)", () => {
  const deltas = [10, 18.4, 25, 45, -15];
  for (const delta of deltas) {
    it(`delta ${delta}°C → no verdict language, keeps review framing`, () => {
      const rec = buildRecommendation({
        metricDelta: delta,
        confidenceScore: 0.968,
        classification: classifyDelta(delta),
        standardRef: "IEC TS 62446-3",
        standardVersion: "2017",
      });
      expect(rec).not.toMatch(VERDICT);
      expect(rec).toContain("Review recommended vs. IEC TS 62446-3");
      expect(rec).toContain("delta vs. median");
    });
  }
});

describe("tolerance evaluation against a RuleSet (CR-15)", () => {
  const rule = {
    triggerMetric: "Temp_Delta_Threshold",
    operator: ">=",
    thresholdValue: 10,
    standardRef: "IEC TS 62446-3",
    standardVersion: "2017",
  };

  it("classifies a delta at/above threshold and stays verdict-free", () => {
    const r = classify({ metricDelta: 18.4, metricUnit: "CELSIUS_DELTA", confidenceScore: 0.968 }, rule);
    expect(r?.matched).toBe(true);
    expect(r?.classification).toContain("IEC TS 62446-3");
    expect(r?.standardRef).toBe("IEC TS 62446-3");
    expect(r?.recommendation).not.toMatch(VERDICT);
  });

  it("does not classify a delta below threshold (no match → no adjudication)", () => {
    const r = classify({ metricDelta: 4.6, metricUnit: "CELSIUS_DELTA", confidenceScore: 0.5 }, rule);
    expect(r).toBeNull();
  });

  it("returns null for an unknown trigger metric", () => {
    const r = classify(
      { metricDelta: 50, metricUnit: "CELSIUS_DELTA", confidenceScore: 0.9 },
      { ...rule, triggerMetric: "Vibration_RMS" },
    );
    expect(r).toBeNull();
  });
});
