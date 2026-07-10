/**
 * Infield Validator — solar-glare check (M2-3a, CR-31, CR-11). Pure/deterministic (SunCalc; the Date
 * is built from a passed-in epoch, never the wall clock). FLAG, don't block: a glare-risk capture is
 * still uploadable; the reviewer sees it may need a re-capture.
 *
 * The PRECISE specular check needs module rack tilt/azimuth + camera heading (registry — M2-3b, same
 * dependency as M2-2b geometry). When that orientation is absent the status is honestly UNVERIFIED
 * (a first-order elevation risk in the reason) — never assumed CLEAR.
 */
import * as SunCalc from "suncalc";
import type { CheckStatus, FrameMeta, GlareStatus } from "./validation";

/** Module + camera orientation for the specular check — from the verified-airframe registry (M2-3b). */
export interface ModuleOrientation {
  moduleTiltDeg: number; // rack tilt from horizontal
  moduleAzimuthDeg: number; // compass bearing the module face points
  cameraHeadingDeg: number; // camera optical-axis compass heading
}

export interface GlareConfig {
  lowSunElevationDeg: number; // below this the scene is broadly reflection-prone
  specularConeDeg: number; // specular reflection within this cone of the camera heading → RISK
}

/** PROVISIONAL, config-driven risk thresholds (pending field calibration, CR-19 posture). */
export const DEFAULT_GLARE_CONFIG: GlareConfig = {
  lowSunElevationDeg: 20,
  specularConeDeg: 15,
};

export interface GlareResult {
  glareStatus: GlareStatus;
  status: CheckStatus; // for the worst-of file status (never FAIL — glare flags, never blocks)
  reason: string;
}

/** Sun position for a UTC instant + location via SunCalc v2 (returns DEGREES; azimuth is compass). Pure. */
export function sunPosition(utcMillis: number, latDeg: number, lonDeg: number): { altitudeDeg: number; azimuthDeg: number } {
  const p = SunCalc.getPosition(new Date(utcMillis), latDeg, lonDeg);
  return { altitudeDeg: p.altitude, azimuthDeg: (((p.azimuth % 360) + 360) % 360) };
}

/** Smallest angle (deg) between two compass bearings. */
export function angularDelta(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** First-order horizontal specular bearing: the incoming sun ray reflected about the module-face normal. */
export function specularReflectionBearing(sunAzimuthDeg: number, o: ModuleOrientation): number {
  const incoming = (sunAzimuthDeg + 180) % 360; // direction the sunlight travels (away from the sun)
  return ((((2 * o.moduleAzimuthDeg - incoming) % 360) + 360) % 360);
}

/**
 * Solar-glare risk for one capture. UNVERIFIED when the sun can't be computed (no time/GPS) or the
 * module orientation is absent (first-order elevation risk only); RISK on a specular hit toward the
 * camera or a low reflection-prone sun; else CLEAR. FLAG only — never FAIL (glare doesn't block upload).
 */
export function checkGlare(
  f: FrameMeta,
  orientation: ModuleOrientation | null,
  config: GlareConfig = DEFAULT_GLARE_CONFIG,
): GlareResult {
  if (f.capturedAt == null || f.latitude == null || f.longitude == null) {
    return { glareStatus: "UNVERIFIED", status: "WARN", reason: "Glare not assessed — capture time / GPS missing." };
  }
  const sun = sunPosition(f.capturedAt, f.latitude, f.longitude);
  if (sun.altitudeDeg < 0) {
    return { glareStatus: "UNVERIFIED", status: "WARN", reason: `Sun below horizon (${sun.altitudeDeg.toFixed(1)}°) — glare not applicable.` };
  }
  const lowSun = sun.altitudeDeg < config.lowSunElevationDeg;

  if (orientation == null) {
    const note = lowSun ? `low sun ${sun.altitudeDeg.toFixed(1)}° — reflection-prone` : `sun ${sun.altitudeDeg.toFixed(1)}°`;
    return { glareStatus: "UNVERIFIED", status: lowSun ? "WARN" : "PASS", reason: `Glare unverified (module orientation absent); ${note}.` };
  }

  const reflectedBearing = specularReflectionBearing(sun.azimuthDeg, orientation);
  const delta = angularDelta(reflectedBearing, orientation.cameraHeadingDeg);
  const specularHit = delta <= config.specularConeDeg;
  if (specularHit) {
    return { glareStatus: "RISK", status: "WARN", reason: `Specular reflection toward the camera (Δ${delta.toFixed(0)}°) — re-capture recommended.` };
  }
  if (lowSun) {
    return { glareStatus: "RISK", status: "WARN", reason: `Low sun ${sun.altitudeDeg.toFixed(1)}° — glare risk; re-capture recommended.` };
  }
  return { glareStatus: "CLEAR", status: "PASS", reason: `Sun ${sun.altitudeDeg.toFixed(1)}°; no specular reflection toward the camera.` };
}
