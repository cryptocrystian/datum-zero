import { describe, it, expect } from "vitest";
import { checkGpsIntegrity, DEFAULT_VALIDATION_CONFIG, type FrameMeta } from "./validation";

const t0 = 1_700_000_000_000;
function frame(over: Partial<FrameMeta>): FrameMeta {
  return {
    name: "c.jpg", index: 0, size: 1000, capturedAt: t0, latitude: 33.5, longitude: -111.9,
    altitude: 100, focalLength35: 24, exposureTime: 1 / 500, iso: 200, fNumber: 5.6,
    imageWidth: 640, imageHeight: 512, make: "Skydio", model: "X10D", serialNumber: "S1",
    radiometricFormat: "FLIR_RJPEG", ...over,
  };
}
const A = frame({});

describe("checkGpsIntegrity (M2-3a/CR-31) — implausible jumps, flag not block", () => {
  it("consecutive nearby captures → PASS", () => {
    const b = frame({ capturedAt: t0 + 2000, latitude: 33.50003, longitude: -111.9 }); // ~3 m in 2 s
    expect(checkGpsIntegrity(b, A, DEFAULT_VALIDATION_CONFIG).status).toBe("PASS");
  });
  it("an implausible jump → WARN (flagged, never blocks upload)", () => {
    const far = frame({ capturedAt: t0 + 2000, latitude: 34.5, longitude: -111.9 }); // ~111 km in 2 s
    const r = checkGpsIntegrity(far, A, DEFAULT_VALIDATION_CONFIG);
    expect(r.status).toBe("WARN");
    expect(r.reason).toMatch(/jump/i);
  });
  it("no GPS on this frame → not applicable (the GPS check handles missing)", () => {
    expect(checkGpsIntegrity(frame({ latitude: null, longitude: null }), A, DEFAULT_VALIDATION_CONFIG).status).toBe("PASS");
  });
  it("no comparable predecessor → PASS", () => {
    expect(checkGpsIntegrity(A, null, DEFAULT_VALIDATION_CONFIG).status).toBe("PASS");
  });
  it("the speed threshold is config-driven (not hardcoded)", () => {
    const far = frame({ capturedAt: t0 + 2000, latitude: 34.5, longitude: -111.9 });
    expect(checkGpsIntegrity(far, A, { ...DEFAULT_VALIDATION_CONFIG, maxGroundSpeedMps: 1e9 }).status).toBe("PASS");
  });
  it("no verdict language (CR-12)", () => {
    const far = frame({ capturedAt: t0 + 2000, latitude: 34.5, longitude: -111.9 });
    expect(checkGpsIntegrity(far, A, DEFAULT_VALIDATION_CONFIG).reason).not.toMatch(/\b(violation|breach|penalty|liable|enforce)\b/i);
  });
});
