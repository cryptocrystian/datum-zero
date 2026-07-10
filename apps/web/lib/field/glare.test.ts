import { describe, it, expect } from "vitest";
import {
  checkGlare,
  sunPosition,
  angularDelta,
  specularReflectionBearing,
  DEFAULT_GLARE_CONFIG,
  type ModuleOrientation,
} from "./glare";
import type { FrameMeta } from "./validation";

const VERDICT = /\b(violation|breach|back-?charge|penalty|liable|guilty|enforce)\b/i;
const AZ_LAT = 33.5;
const AZ_LON = -111.9;
const NOON = Date.UTC(2023, 5, 21, 19, 0, 0); // ~solar noon in AZ (high sun)
const EVENING = Date.UTC(2023, 5, 22, 2, 30, 0); // ~19:30 local (low sun)
const NIGHT = Date.UTC(2023, 5, 21, 8, 0, 0); // ~01:00 local (below horizon)

function frame(over: Partial<FrameMeta>): FrameMeta {
  return {
    name: "c.jpg", index: 0, size: 1000, capturedAt: null, latitude: null, longitude: null,
    altitude: 100, focalLength35: 24, exposureTime: 1 / 500, iso: 200, fNumber: 5.6,
    imageWidth: 640, imageHeight: 512, make: "Skydio", model: "X10D", serialNumber: "S1",
    radiometricFormat: "FLIR_RJPEG", ...over,
  };
}
const withGps = (capturedAt: number) => frame({ capturedAt, latitude: AZ_LAT, longitude: AZ_LON });
const O = (cameraHeadingDeg: number): ModuleOrientation => ({ moduleTiltDeg: 20, moduleAzimuthDeg: 180, cameraHeadingDeg });

describe("pure geometry helpers", () => {
  it("angularDelta wraps around the compass", () => {
    expect(angularDelta(10, 350)).toBe(20);
    expect(angularDelta(0, 180)).toBe(180);
  });
  it("specular reflects the incoming ray about the module-face normal", () => {
    // module faces south (180); sun due south (az 180) → incoming 0 → reflected 2·180−0 = 0 (north).
    expect(specularReflectionBearing(180, O(0))).toBeCloseTo(0, 5);
  });
});

describe("checkGlare (M2-3a/CR-31) — flag, honest UNVERIFIED", () => {
  it("no capture time / GPS → UNVERIFIED", () => {
    expect(checkGlare(frame({}), null).glareStatus).toBe("UNVERIFIED");
  });
  it("sun below horizon → UNVERIFIED", () => {
    expect(checkGlare(withGps(NIGHT), null).glareStatus).toBe("UNVERIFIED");
  });
  it("daytime but module orientation absent → UNVERIFIED (never assumed CLEAR)", () => {
    expect(checkGlare(withGps(NOON), null).glareStatus).toBe("UNVERIFIED");
  });
  it("high midday sun, camera pointed away from the reflection → CLEAR", () => {
    const f = withGps(NOON);
    const reflected = specularReflectionBearing(sunPosition(f.capturedAt!, f.latitude!, f.longitude!).azimuthDeg, O(0));
    expect(sunPosition(f.capturedAt!, f.latitude!, f.longitude!).altitudeDeg).toBeGreaterThan(DEFAULT_GLARE_CONFIG.lowSunElevationDeg);
    expect(checkGlare(f, O((reflected + 90) % 360)).glareStatus).toBe("CLEAR");
  });
  it("specular reflection into the camera → RISK + re-capture recommended", () => {
    const f = withGps(NOON);
    const reflected = specularReflectionBearing(sunPosition(f.capturedAt!, f.latitude!, f.longitude!).azimuthDeg, O(0));
    const r = checkGlare(f, O(reflected));
    expect(r.glareStatus).toBe("RISK");
    expect(r.reason).toMatch(/re-capture/i);
  });
  it("a reflection-prone (low) sun → RISK — config-driven threshold", () => {
    // Deterministic: a config where any daytime sun counts as low. Camera away from the specular cone,
    // so the low-sun branch is what flags RISK (config-driven, no wall-clock / solar-time guessing).
    const f = withGps(NOON);
    const reflected = specularReflectionBearing(sunPosition(f.capturedAt!, f.latitude!, f.longitude!).azimuthDeg, O(0));
    const r = checkGlare(f, O((reflected + 90) % 360), { lowSunElevationDeg: 90, specularConeDeg: 15 });
    expect(r.glareStatus).toBe("RISK");
    expect(r.reason).toMatch(/re-capture/i);
  });
  it("no verdict language in the copy (CR-12)", () => {
    for (const r of [checkGlare(frame({}), null), checkGlare(withGps(NOON), O(0)), checkGlare(withGps(EVENING), null)]) {
      expect(r.reason).not.toMatch(VERDICT);
    }
  });
});
