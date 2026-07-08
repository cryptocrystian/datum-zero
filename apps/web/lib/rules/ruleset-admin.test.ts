import { describe, it, expect } from "vitest";
import { validateRuleSetInput, type RuleSetInput } from "./ruleset-admin";

const ALLOWED = ["GENERIC_WEBHOOK", "NATIVE_JIRA"];

const base: RuleSetInput = {
  name: "Solar thermal — hot string",
  targetModality: "DRONE_THERMAL",
  triggerMetric: "Temp_Delta_Threshold",
  operator: ">=",
  thresholdValue: 10,
  routeTargets: ["GENERIC_WEBHOOK", "NATIVE_JIRA"],
  standardRef: "IEC TS 62446-3",
  standardVersion: "2017",
  isTemplate: false,
};

describe("validateRuleSetInput — client policy fields the engine consumes (OPS-1, CR-15)", () => {
  it("accepts a well-formed policy", () => {
    expect(validateRuleSetInput(base, ALLOWED)).toEqual({ ok: true });
  });

  it("rejects verdict language in the name (CR-12)", () => {
    // guardrail:allow-verdict-term — these are negative-test inputs the validator must REJECT.
    const bads = ["Contract violation policy", "Breach escalation", "Back-charge routing", "Penalty tier"]; // guardrail:allow-verdict-term
    for (const bad of bads) {
      const r = validateRuleSetInput({ ...base, name: bad }, ALLOWED);
      expect(r.ok).toBe(false);
    }
  });

  it("requires a non-empty name", () => {
    expect(validateRuleSetInput({ ...base, name: "   " }, ALLOWED).ok).toBe(false);
  });

  it("rejects an unknown modality", () => {
    expect(validateRuleSetInput({ ...base, targetModality: "SPACE_LIDAR" }, ALLOWED).ok).toBe(false);
  });

  it("rejects a trigger metric the policy engine cannot resolve", () => {
    expect(validateRuleSetInput({ ...base, triggerMetric: "Vibration_RMS" }, ALLOWED).ok).toBe(false);
  });

  it("rejects an unknown operator", () => {
    expect(validateRuleSetInput({ ...base, operator: "≥" }, ALLOWED).ok).toBe(false);
  });

  it("rejects a negative or non-finite threshold", () => {
    expect(validateRuleSetInput({ ...base, thresholdValue: -5 }, ALLOWED).ok).toBe(false);
    expect(validateRuleSetInput({ ...base, thresholdValue: NaN }, ALLOWED).ok).toBe(false);
  });

  it("requires at least one route target", () => {
    expect(validateRuleSetInput({ ...base, routeTargets: [] }, ALLOWED).ok).toBe(false);
  });

  it("rejects a route target that is not an active integration for the org", () => {
    const r = validateRuleSetInput({ ...base, routeTargets: ["CSV_S3"] }, ALLOWED);
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate route targets", () => {
    expect(validateRuleSetInput({ ...base, routeTargets: ["GENERIC_WEBHOOK", "GENERIC_WEBHOOK"] }, ALLOWED).ok).toBe(false);
  });

  it("rejects verdict language in standardRef (CR-12)", () => {
    expect(validateRuleSetInput({ ...base, standardRef: "liable-per-contract" }, ALLOWED).ok).toBe(false); // guardrail:allow-verdict-term
  });
});
