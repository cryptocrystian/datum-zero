import { describe, it, expect } from "vitest";
import { applyPolicy, buildRecommendation, deltaCategory, modelCategory, type PolicySpec } from "./tolerance-eval";

// The verdict-language guard (mirrors tests/guardrails). Defining it here needs the literal terms.
const VERDICT = /\b(violation|breach|back[- ]?charge|penalty|liable|guilty)\b/i; // guardrail:allow-verdict-term

const RULE: PolicySpec = {
  triggerMetric: "Temp_Delta_Threshold",
  operator: ">=",
  thresholdValue: 10,
  routeTargets: ["GENERIC_WEBHOOK", "NATIVE_JIRA"],
  standardRef: "IEC TS 62446-3",
  standardVersion: "2017",
};

describe("recommendation generator is evidence-framed, never a verdict (CR-12)", () => {
  for (const delta of [10, 18.4, 25, 45, -15]) {
    it(`delta ${delta}°C → no verdict language, keeps review framing`, () => {
      const rec = buildRecommendation({
        classification: "IEC TS 62446-3 Cat 2 — Cell: single hot cell",
        metricDelta: delta,
        confidenceScore: 0.968,
        priority: "SCHEDULED",
        standardRef: "IEC TS 62446-3",
        standardVersion: "2017",
      });
      expect(rec).not.toMatch(VERDICT);
      expect(rec).toContain("Review recommended vs. IEC TS 62446-3");
      expect(rec).toContain("delta vs. median");
      expect(rec).toContain("Priority SCHEDULED");
    });
  }
});

describe("modelCategory reads the MODEL's IEC category (model owns the type — CR-19)", () => {
  it("parses the category from the model classification string", () => {
    expect(modelCategory("IEC TS 62446-3 Cat 3 — Diode: bypass diode activated")).toBe(3);
    expect(modelCategory("IEC TS 62446-3 Cat 1 — No-Anomaly: nominal")).toBe(1);
  });
  it("returns null when no category is present (caller falls back)", () => {
    expect(modelCategory("unclassified")).toBeNull();
    expect(modelCategory(null)).toBeNull();
  });
});

describe("deltaCategory bands ΔT by the client's escalation knob (CR-15 amend)", () => {
  it("thresholdValue is the SCHEDULED floor; 2× is the PROMPT floor", () => {
    expect(deltaCategory(5, 10)).toBe(1); // below → MONITOR band
    expect(deltaCategory(12, 10)).toBe(2); // ≥ threshold → SCHEDULED band
    expect(deltaCategory(25, 10)).toBe(3); // ≥ 2× threshold → PROMPT band
  });
});

describe("applyPolicy = client policy over the model classification (DET-1c, CR-15 amend)", () => {
  it("keeps the model category when ΔT does not escalate; verdict-free", () => {
    const r = applyPolicy(
      { classification: "IEC TS 62446-3 Cat 2 — Cell: single hot cell", metricDelta: 12, metricUnit: "CELSIUS_DELTA", confidenceScore: 0.9, standardRef: "IEC TS 62446-3" },
      RULE,
    );
    expect(r.category).toBe(2);
    expect(r.priority).toBe("SCHEDULED");
    expect(r.routeTargets).toEqual(["GENERIC_WEBHOOK", "NATIVE_JIRA"]);
    expect(r.recommendation).not.toMatch(VERDICT);
  });

  it("a high ΔT ESCALATES a low-category model finding toward PROMPT (combine class + ΔT)", () => {
    const r = applyPolicy(
      { classification: "IEC TS 62446-3 Cat 1 — Soiling: surface contamination", metricDelta: 25, metricUnit: "CELSIUS_DELTA", confidenceScore: 0.8, standardRef: "IEC TS 62446-3" },
      RULE,
    );
    expect(r.category).toBe(3); // max(model Cat 1, ΔT band 3) = 3
    expect(r.priority).toBe("PROMPT");
  });

  it("ΔT never DOWNGRADES a severe model finding", () => {
    const r = applyPolicy(
      { classification: "IEC TS 62446-3 Cat 3 — Offline-Module: module offline", metricDelta: 2, metricUnit: "CELSIUS_DELTA", confidenceScore: 0.9, standardRef: "IEC TS 62446-3" },
      RULE,
    );
    expect(r.category).toBe(3);
    expect(r.priority).toBe("PROMPT");
  });

  it("no ΔT escalation when the client's trigger metric is unresolvable", () => {
    const r = applyPolicy(
      { classification: "IEC TS 62446-3 Cat 1 — Shadowing: obstruction", metricDelta: 50, metricUnit: "CELSIUS_DELTA", confidenceScore: 0.9, standardRef: "IEC TS 62446-3" },
      { ...RULE, triggerMetric: "Vibration_RMS" },
    );
    expect(r.category).toBe(1); // trigger not resolvable → no escalation, keep model category
    expect(r.priority).toBe("MONITOR");
  });
});
