/**
 * Environmental inspection-condition gate (M2-2b, CR-29) — pure, deterministic, dependency-free.
 *
 * IEC TS 62446-3 §5 requires the site conditions under which an absolute-temperature / ΔT reading is
 * trustworthy. This evaluates SESSION-level telemetry and returns a calibration status. It FLAGS, it
 * does NOT block (evidence, not verdict): the flight still processes; findings inherit the marker so
 * the reviewer + the normalization layer treat the category as provisional under a bad environment.
 *
 * SCADA is OPTIONAL — the pipeline runs without it. Bounds are PROVISIONAL pending confirmation vs. the
 * licensed IEC TS 62446-3:2017 Table 3 (config-driven; never hardcoded at the call site).
 */

export type CalibrationStatus = "CALIBRATED" | "CALIBRATED_BY_SCADA_LOAD" | "UNRELIABLE_ENVIRONMENT";

/** Site telemetry at capture (all best-effort/nullable — an absent field is "unknown", not "failed"). */
export interface EnvironmentTelemetry {
  irradianceWm2: number | null; // in-plane irradiance
  windMs: number | null;
  cloudOktas: number | null; // 0..8
  surfaceDry: boolean | null;
}

/** Optional SCADA reading at the capture timestamp (DC-load fraction 0..1). Absent => not consulted. */
export interface ScadaLoad {
  dcLoadFraction: number | null;
}

export interface EnvironmentConfig {
  minIrradianceWm2: number;
  maxWindMs: number;
  maxCloudOktas: number;
  minScadaLoadFraction: number; // DC-load fallback when irradiance is below minimum
}

/** PROVISIONAL defaults — pending confirmation vs. IEC TS 62446-3:2017 Table 3. Config-driven. */
export const DEFAULT_ENVIRONMENT_CONFIG: EnvironmentConfig = {
  minIrradianceWm2: 600,
  maxWindMs: 4.0,
  maxCloudOktas: 2,
  minScadaLoadFraction: 0.3,
};

function knownAndOver(value: number | null, limit: number): boolean {
  return value != null && value > limit;
}

/**
 * Session calibration status, or `null` when there is NO telemetry to evaluate (not evaluated — never
 * fabricated). A wind/cloud/wet-surface violation is decisive (UNRELIABLE). Otherwise irradiance ≥ min
 * → CALIBRATED; below min but SCADA DC-load ≥ min → CALIBRATED_BY_SCADA_LOAD; else UNRELIABLE.
 */
export function evaluateEnvironment(
  t: EnvironmentTelemetry,
  scada: ScadaLoad | null = null,
  config: EnvironmentConfig = DEFAULT_ENVIRONMENT_CONFIG,
): CalibrationStatus | null {
  const noTelemetry =
    t.irradianceWm2 == null && t.windMs == null && t.cloudOktas == null && t.surfaceDry == null;
  if (noTelemetry) return null; // not evaluated

  // Non-irradiance conditions: a known violation is decisive (unknown fields don't fail the gate).
  if (knownAndOver(t.windMs, config.maxWindMs)) return "UNRELIABLE_ENVIRONMENT";
  if (knownAndOver(t.cloudOktas, config.maxCloudOktas)) return "UNRELIABLE_ENVIRONMENT";
  if (t.surfaceDry === false) return "UNRELIABLE_ENVIRONMENT";

  if (t.irradianceWm2 != null && t.irradianceWm2 >= config.minIrradianceWm2) {
    return "CALIBRATED";
  }
  // Irradiance below minimum (or unknown): the optional SCADA DC-load fallback, else unreliable.
  if (scada?.dcLoadFraction != null && scada.dcLoadFraction >= config.minScadaLoadFraction) {
    return "CALIBRATED_BY_SCADA_LOAD";
  }
  return "UNRELIABLE_ENVIRONMENT";
}

/** Evidence-framed, operator-facing note for a session calibration status (no verdict language, CR-12). */
export function calibrationNote(status: CalibrationStatus | null): string | null {
  switch (status) {
    case "CALIBRATED":
      return "Environment within IEC TS 62446-3 (CD) inspection conditions.";
    case "CALIBRATED_BY_SCADA_LOAD":
      return "Irradiance below target — calibrated by SCADA DC-load; category confidence reduced.";
    case "UNRELIABLE_ENVIRONMENT":
      return "Environment outside inspection conditions — category provisional; reviewer confirmation recommended.";
    default:
      return null;
  }
}
