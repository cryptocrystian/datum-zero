import { describe, it, expect } from "vitest";
import { coverageStatus, DEFAULT_VALIDATION_CONFIG, type FrameMeta } from "./validation";

const VERDICT = /\b(violation|breach|back-?charge|penalty|liable|guilty|enforce)\b/i;

function frame(over: Partial<FrameMeta>): FrameMeta {
  return {
    name: "c.jpg", index: 0, size: 1000, capturedAt: 1_700_000_000_000, latitude: null, longitude: null,
    altitude: 100, focalLength35: 24, exposureTime: 1 / 500, iso: 200, fNumber: 5.6,
    imageWidth: 640, imageHeight: 512, make: "Skydio", model: "X10D", serialNumber: "S1",
    radiometricFormat: "FLIR_RJPEG", ...over,
  };
}

// Footprint at alt 100, default FOV 73.7° ≈ 150 m. overlap = (1 − spacing/150)·100.
// spacing 15 m → ~90% (SUFFICIENT); spacing 90 m → ~40% (INSUFFICIENT).
function line(count: number, spacingM: number): FrameMeta[] {
  const out: FrameMeta[] = [];
  for (let i = 0; i < count; i++) {
    out.push(frame({ index: i, latitude: 33.5 + (i * spacingM) / 111320, longitude: -111.9 }));
  }
  return out;
}

describe("coverageStatus (M2-3a/CR-31) — session-level haversine overlap", () => {
  it("a dense line (tight spacing) → SUFFICIENT", () => {
    const r = coverageStatus(line(6, 15));
    expect(r.coverageStatus).toBe("SUFFICIENT");
    expect(r.reason).not.toMatch(VERDICT);
  });

  it("a sparse line (wide spacing) → INSUFFICIENT (coverage gaps)", () => {
    expect(coverageStatus(line(6, 90)).coverageStatus).toBe("INSUFFICIENT");
  });

  it("moderate spacing → PARTIAL", () => {
    // ~65% overlap: spacing ~52 m → (1 − 52/150)·100 ≈ 65 (between fail 60 and warn 70).
    expect(coverageStatus(line(6, 52)).coverageStatus).toBe("PARTIAL");
  });

  it("no GPS across the set → UNVERIFIED (never assumed)", () => {
    expect(coverageStatus([frame({}), frame({ index: 1 })]).coverageStatus).toBe("UNVERIFIED");
    expect(coverageStatus(line(1, 15)).coverageStatus).toBe("UNVERIFIED"); // single frame, no pair
  });

  it("thresholds are the config-driven overlap targets", () => {
    // relax the target so the sparse line passes — proves config-driven, not hardcoded.
    const loose = { ...DEFAULT_VALIDATION_CONFIG, overlapForwardWarnPct: 30, overlapForwardFailPct: 20 };
    expect(coverageStatus(line(6, 90), loose).coverageStatus).toBe("SUFFICIENT");
  });
});
