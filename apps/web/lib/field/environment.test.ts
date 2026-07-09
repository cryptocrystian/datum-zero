import { describe, it, expect } from "vitest";
import {
  evaluateEnvironment,
  calibrationNote,
  DEFAULT_ENVIRONMENT_CONFIG,
  type EnvironmentTelemetry,
} from "./environment";

const VERDICT = /\b(violation|breach|back-?charge|penalty|liable|guilty|enforce)\b/i;
const dry: EnvironmentTelemetry = { irradianceWm2: 800, windMs: 2, cloudOktas: 1, surfaceDry: true };

describe("evaluateEnvironment — session inspection-condition gate (CR-29, flag not block)", () => {
  it("all conditions in bounds → CALIBRATED", () => {
    expect(evaluateEnvironment(dry)).toBe("CALIBRATED");
  });

  it("wind over the limit → UNRELIABLE_ENVIRONMENT (decisive)", () => {
    expect(evaluateEnvironment({ ...dry, windMs: 4.5 })).toBe("UNRELIABLE_ENVIRONMENT");
  });

  it("cloud over the limit / wet surface → UNRELIABLE_ENVIRONMENT", () => {
    expect(evaluateEnvironment({ ...dry, cloudOktas: 5 })).toBe("UNRELIABLE_ENVIRONMENT");
    expect(evaluateEnvironment({ ...dry, surfaceDry: false })).toBe("UNRELIABLE_ENVIRONMENT");
  });

  it("irradiance below minimum + SCADA DC-load ≥ 30% → CALIBRATED_BY_SCADA_LOAD", () => {
    expect(evaluateEnvironment({ ...dry, irradianceWm2: 500 }, { dcLoadFraction: 0.35 })).toBe(
      "CALIBRATED_BY_SCADA_LOAD",
    );
  });

  it("irradiance below minimum + no SCADA → UNRELIABLE_ENVIRONMENT (never fabricated)", () => {
    expect(evaluateEnvironment({ ...dry, irradianceWm2: 500 })).toBe("UNRELIABLE_ENVIRONMENT");
    expect(evaluateEnvironment({ ...dry, irradianceWm2: 500 }, { dcLoadFraction: 0.1 })).toBe(
      "UNRELIABLE_ENVIRONMENT",
    );
  });

  it("no telemetry at all → null (not evaluated, not fabricated)", () => {
    expect(
      evaluateEnvironment({ irradianceWm2: null, windMs: null, cloudOktas: null, surfaceDry: null }),
    ).toBeNull();
  });

  it("bounds are the provisional Table-3 defaults, config-driven", () => {
    expect(DEFAULT_ENVIRONMENT_CONFIG.minIrradianceWm2).toBe(600);
    expect(DEFAULT_ENVIRONMENT_CONFIG.maxWindMs).toBe(4.0);
    // a custom config can tighten/loosen without touching the evaluator.
    expect(evaluateEnvironment({ ...dry, windMs: 4.5 }, null, { ...DEFAULT_ENVIRONMENT_CONFIG, maxWindMs: 5 })).toBe(
      "CALIBRATED",
    );
  });

  it("notes are evidence-framed (no verdict language, CR-12)", () => {
    for (const s of ["CALIBRATED", "CALIBRATED_BY_SCADA_LOAD", "UNRELIABLE_ENVIRONMENT", null] as const) {
      const note = calibrationNote(s);
      if (note) expect(note).not.toMatch(VERDICT);
    }
    expect(calibrationNote("UNRELIABLE_ENVIRONMENT")).toMatch(/provisional/i);
  });
});
