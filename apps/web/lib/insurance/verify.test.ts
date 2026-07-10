import { describe, it, expect } from "vitest";
import {
  verifyCoverage,
  evaluateCoverage,
  type CoveragePolicy,
  type CoverageProfile,
  type MissionWindow,
} from "./verify";

// A fully-adequate baseline: $5M dedicated-aviation policy, all riders present, verified, window
// comfortably around a single-day mission. Each case overrides ONE dimension to prove independence.
const WINDOW: MissionWindow = { start: new Date("2026-07-15T00:00:00Z"), end: new Date("2026-07-15T23:59:59Z") };

function policy(over: Partial<CoveragePolicy> = {}): CoveragePolicy {
  return {
    liabilityLimit: 5_000_000,
    isDedicatedAviation: true,
    hasBlanketAI: true,
    hasPrimaryNonContrib: true,
    hasWaiverOfSubrogation: true,
    isVerified: true,
    coverageStart: new Date("2026-07-01T00:00:00Z"),
    coverageEnd: new Date("2026-07-31T00:00:00Z"),
    ...over,
  };
}

function profile(over: Partial<CoverageProfile> = {}): CoverageProfile {
  return {
    requiredLiabilityLimit: 5_000_000,
    requiresDedicatedAviation: true,
    requiresAdditionalInsured: true,
    requiresPrimaryNonContrib: true,
    requiresWaiverOfSubrogation: true,
    ...over,
  };
}

describe("verifyCoverage — a PROFILE match, not a number (CR-02/CR-09/CR-10)", () => {
  it("a fully-adequate policy passes with no failures", () => {
    const r = verifyCoverage(policy(), profile(), WINDOW);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("fails on a low liability limit, with the specific amounts", () => {
    const r = verifyCoverage(policy({ liabilityLimit: 2_000_000 }), profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("liability limit $2,000,000 below required $5,000,000");
  });

  it("fails when the policy is not dedicated-aviation (a CGL rider is not enough, CR-09)", () => {
    const r = verifyCoverage(policy({ isDedicatedAviation: false }), profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /dedicated-aviation/.test(f))).toBe(true);
  });

  it("fails when the client is not named additional-insured", () => {
    const r = verifyCoverage(policy({ hasBlanketAI: false }), profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /additional-insured/.test(f))).toBe(true);
  });

  it("fails when the policy is not primary & non-contributory", () => {
    const r = verifyCoverage(policy({ hasPrimaryNonContrib: false }), profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /primary & non-contributory/.test(f))).toBe(true);
  });

  it("fails when the policy has no waiver of subrogation", () => {
    const r = verifyCoverage(policy({ hasWaiverOfSubrogation: false }), profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /waiver of subrogation/.test(f))).toBe(true);
  });

  it("fails when the policy is not verified (CR-10 fail closed)", () => {
    const r = verifyCoverage(policy({ isVerified: false }), profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /not verified/.test(f))).toBe(true);
  });

  it("fails when coverage ends before the mission window (window not fully contained)", () => {
    const r = verifyCoverage(policy({ coverageEnd: new Date("2026-07-14T00:00:00Z") }), profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /coverage ends before the mission end/.test(f))).toBe(true);
  });

  it("fails when coverage begins after the mission start", () => {
    const r = verifyCoverage(policy({ coverageStart: new Date("2026-07-16T00:00:00Z") }), profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /coverage begins after the mission start/.test(f))).toBe(true);
  });

  it("fails closed when the policy has no confirmed coverage window", () => {
    const r = verifyCoverage(policy({ coverageStart: null, coverageEnd: null }), profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /no confirmed coverage window/.test(f))).toBe(true);
  });

  it("reports EVERY failed dimension at once (not just the first)", () => {
    const r = verifyCoverage(
      policy({ liabilityLimit: 1, isDedicatedAviation: false, hasBlanketAI: false, isVerified: false }),
      profile(),
      WINDOW,
    );
    expect(r.ok).toBe(false);
    expect(r.failures.length).toBeGreaterThanOrEqual(4);
  });

  // --- Boundaries ---
  it("boundary: a limit exactly equal to the requirement passes", () => {
    expect(verifyCoverage(policy({ liabilityLimit: 5_000_000 }), profile(), WINDOW).ok).toBe(true);
  });

  it("boundary: coverage exactly equal to the mission window passes (inclusive)", () => {
    const r = verifyCoverage(
      policy({ coverageStart: WINDOW.start, coverageEnd: WINDOW.end }),
      profile(),
      WINDOW,
    );
    expect(r.ok).toBe(true);
  });

  it("boundary: coverage ending one day before the mission end fails", () => {
    const dayBefore = new Date(WINDOW.end.getTime() - 24 * 3600 * 1000);
    const r = verifyCoverage(policy({ coverageEnd: dayBefore }), profile(), WINDOW);
    expect(r.ok).toBe(false);
  });

  it("a relaxed profile (nothing required beyond a $0 limit) passes a bare verified policy", () => {
    const bare = policy({
      isDedicatedAviation: false,
      hasBlanketAI: false,
      hasPrimaryNonContrib: false,
      hasWaiverOfSubrogation: false,
    });
    const relaxed = profile({
      requiredLiabilityLimit: 0,
      requiresDedicatedAviation: false,
      requiresAdditionalInsured: false,
      requiresPrimaryNonContrib: false,
      requiresWaiverOfSubrogation: false,
    });
    expect(verifyCoverage(bare, relaxed, WINDOW).ok).toBe(true);
  });

  it("evaluateCoverage: passes if ANY of the pilot's policies is adequate", () => {
    const inadequate = policy({ isVerified: false });
    const adequate = policy();
    expect(evaluateCoverage([inadequate, adequate], profile(), WINDOW).ok).toBe(true);
  });

  it("evaluateCoverage: no policies on file fails closed", () => {
    const r = evaluateCoverage([], profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /no insurance policy on file/.test(f))).toBe(true);
  });

  it("evaluateCoverage: when none pass, surfaces the closest candidate's reasons", () => {
    const wayOff = policy({ liabilityLimit: 1, isDedicatedAviation: false, hasBlanketAI: false, isVerified: false });
    const oneGap = policy({ isVerified: false }); // a single failed dimension
    const r = evaluateCoverage([wayOff, oneGap], profile(), WINDOW);
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatch(/not verified/);
  });

  it("no verdict language in any failure reason (CR-12)", () => {
    // Trip every dimension, then scan all reasons.
    const r = verifyCoverage(
      policy({
        liabilityLimit: 1,
        isDedicatedAviation: false,
        hasBlanketAI: false,
        hasPrimaryNonContrib: false,
        hasWaiverOfSubrogation: false,
        isVerified: false,
        coverageStart: null,
        coverageEnd: null,
      }),
      profile(),
      WINDOW,
    );
    for (const reason of r.failures) {
      expect(reason).not.toMatch(/\b(violation|breach|back-charge|penalty|liable|enforce)\b/i);
    }
  });
});
