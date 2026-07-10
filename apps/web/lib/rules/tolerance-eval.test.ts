import { describe, it, expect } from "vitest";
import {
  applyPolicy,
  buildRecommendation,
  priorityForCategory,
  DEFAULT_CATEGORY_PRIORITY,
  type PolicySpec,
  type ModelFinding,
} from "./tolerance-eval";

// The verdict-language guard (mirrors tests/guardrails). Defining it here needs the literal terms.
const VERDICT = /\b(violation|breach|back[- ]?charge|penalty|liable|guilty)\b/i; // guardrail:allow-verdict-term

const RULE: PolicySpec = {
  categoryPriority: DEFAULT_CATEGORY_PRIORITY,
  routeTargets: ["GENERIC_WEBHOOK", "NATIVE_JIRA"],
  standardRef: "IEC TS 62446-3",
  standardVersion: "2017",
};

function finding(iecCategory: 1 | 2 | 3 | null): ModelFinding {
  return {
    iecCategory,
    classification: iecCategory ? `IEC TS 62446-3 Cat ${iecCategory} — Cell: single hot cell` : "IEC TS 62446-3 — No-Anomaly",
    metricDelta: 18.4,
    confidenceScore: 0.968,
    standardRef: "IEC TS 62446-3",
  };
}

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

describe("priorityForCategory — objective category → priority under client policy (CR-30)", () => {
  it("the standards default: 1→MONITOR, 2→SCHEDULED, 3→PROMPT", () => {
    expect(priorityForCategory(1, DEFAULT_CATEGORY_PRIORITY)).toBe("MONITOR");
    expect(priorityForCategory(2, DEFAULT_CATEGORY_PRIORITY)).toBe("SCHEDULED");
    expect(priorityForCategory(3, DEFAULT_CATEGORY_PRIORITY)).toBe("PROMPT");
  });

  it("a client override is honored (Cat 2 → PROMPT); missing keys fall back to the default", () => {
    const map = { "2": "PROMPT" } as const;
    expect(priorityForCategory(2, map)).toBe("PROMPT");
    expect(priorityForCategory(1, map)).toBe("MONITOR"); // fallback
    expect(priorityForCategory(3, map)).toBe("PROMPT"); // fallback
  });
});

describe("applyPolicy = priority is a pure function of the objective IEC category (CR-30)", () => {
  it("derives priority from the category via the default map; verdict-free", () => {
    const r = applyPolicy(finding(2), RULE);
    expect(r).not.toBeNull();
    expect(r!.category).toBe(2);
    expect(r!.priority).toBe("SCHEDULED");
    expect(r!.routeTargets).toEqual(["GENERIC_WEBHOOK", "NATIVE_JIRA"]);
    expect(r!.recommendation).not.toMatch(VERDICT);
    expect(r!.recommendation).toContain("Priority SCHEDULED");
  });

  it("honors a client override (Cat 2 → PROMPT) — no ΔT involved", () => {
    const r = applyPolicy(finding(2), { ...RULE, categoryPriority: { "2": "PROMPT" } });
    expect(r!.priority).toBe("PROMPT");
  });

  it("Cat 1 → MONITOR, Cat 3 → PROMPT (default)", () => {
    expect(applyPolicy(finding(1), RULE)!.priority).toBe("MONITOR");
    expect(applyPolicy(finding(3), RULE)!.priority).toBe("PROMPT");
  });

  it("null category (No-Anomaly / Shadowing-rerouted) → no dispatchable priority", () => {
    expect(applyPolicy(finding(null), RULE)).toBeNull();
  });

  it("priority does NOT depend on ΔT — same category, different ΔT, same priority", () => {
    const low = applyPolicy({ ...finding(2), metricDelta: 3 }, RULE);
    const high = applyPolicy({ ...finding(2), metricDelta: 90 }, RULE);
    expect(low!.priority).toBe("SCHEDULED");
    expect(high!.priority).toBe("SCHEDULED"); // ΔT no longer escalates priority (CR-30)
  });
});
