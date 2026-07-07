import { describe, it, expect } from "vitest";
import {
  DEFAULT_VALIDATION_CONFIG,
  type FrameMeta,
  type ValidationConfig,
  checkFrame,
  checkGps,
  checkSunGlare,
  checkExposure,
  checkOverlap,
  checkNdaa,
  checkAirframe,
  solarElevationDeg,
  haversineMeters,
  validateCaptureSet,
  type RegistryScreen,
} from "./validation";

// A registry screen where the seeded verified serial resolves VERIFIED and the rest are flagged.
const REGISTRY: RegistryScreen = {
  airframeBySerial: {
    "DZ-THERMAL-0001": { serial: "DZ-THERMAL-0001", status: "VERIFIED", message: "Airframe DZ-THERMAL-0001 (Skydio X10D) registered + verified." },
    "DZ-THERMAL-9999": { serial: "DZ-THERMAL-9999", status: "UNVERIFIED", message: "Airframe DZ-THERMAL-9999 is registered but not verified." },
  },
};

// A nominal, healthy frame near the seeded Arizona site, ~28 min before local solar noon in June.
const NOON = Date.UTC(2023, 5, 21, 19, 0, 0);
const BASE_LAT = 33.5;
const BASE_LON = -111.9;
const metersToLat = (m: number) => m / 111320;

function frame(over: Partial<FrameMeta> = {}, index = 0): FrameMeta {
  return {
    name: `DJI_${String(index).padStart(4, "0")}.JPG`,
    index,
    size: 8_000_000,
    capturedAt: NOON,
    latitude: BASE_LAT,
    longitude: BASE_LON,
    altitude: 100,
    focalLength35: 24, // -> 73.7° FOV -> 150 m footprint at 100 m
    exposureTime: 1 / 500,
    iso: 200,
    fNumber: 5.6,
    imageWidth: 5472,
    imageHeight: 3648,
    make: "Skydio",
    model: "X10D",
    serialNumber: "DZ-THERMAL-0001",
    ...over,
  };
}

/** Build a straight capture line: `count` frames `spacingM` apart along latitude. */
function line(count: number, spacingM: number, over: Partial<FrameMeta> = {}): FrameMeta[] {
  return Array.from({ length: count }, (_, i) =>
    frame({ latitude: BASE_LAT + metersToLat(spacingM * i), ...over }, i),
  );
}

describe("solarElevationDeg", () => {
  it("is ~66.5° at local solar noon on the equator at solstice", () => {
    const elev = solarElevationDeg(Date.UTC(2023, 5, 21, 12, 0, 0), 0, 0);
    expect(elev).toBeGreaterThan(64);
    expect(elev).toBeLessThan(69);
  });

  it("is near the zenith over the Tropic of Cancer at solstice noon", () => {
    const elev = solarElevationDeg(Date.UTC(2023, 5, 21, 12, 0, 0), 23.44, 0);
    expect(elev).toBeGreaterThan(87);
  });

  it("is below the horizon at local midnight", () => {
    const elev = solarElevationDeg(Date.UTC(2023, 5, 21, 0, 0, 0), 0, 0);
    expect(elev).toBeLessThan(-50);
  });
});

describe("haversineMeters", () => {
  it("measures a short north-south hop", () => {
    const d = haversineMeters(BASE_LAT, BASE_LON, BASE_LAT + metersToLat(30), BASE_LON);
    expect(d).toBeGreaterThan(29);
    expect(d).toBeLessThan(31);
  });
});

describe("checkGps", () => {
  it("PASS with coordinates + altitude", () => {
    expect(checkGps(frame()).status).toBe("PASS");
  });
  it("FAIL when coordinates are missing", () => {
    expect(checkGps(frame({ latitude: null, longitude: null })).status).toBe("FAIL");
  });
  it("FAIL on null island (0,0)", () => {
    expect(checkGps(frame({ latitude: 0, longitude: 0 })).status).toBe("FAIL");
  });
  it("WARN when altitude is missing", () => {
    expect(checkGps(frame({ altitude: null })).status).toBe("WARN");
  });
});

describe("checkSunGlare (banding via config, so it never depends on exact solar timing)", () => {
  const noon = frame(); // ~80° elevation
  it("PASS when the sun is well above the warn threshold", () => {
    expect(checkSunGlare(noon, DEFAULT_VALIDATION_CONFIG).status).toBe("PASS");
  });
  it("WARN when elevation falls in the warn band", () => {
    const cfg: ValidationConfig = { ...DEFAULT_VALIDATION_CONFIG, sunGlareWarnBelowDeg: 90, sunGlareFailBelowDeg: 50 };
    expect(checkSunGlare(noon, cfg).status).toBe("WARN");
  });
  it("FAIL when elevation falls in the fail band", () => {
    const cfg: ValidationConfig = { ...DEFAULT_VALIDATION_CONFIG, sunGlareWarnBelowDeg: 90, sunGlareFailBelowDeg: 85 };
    expect(checkSunGlare(noon, cfg).status).toBe("FAIL");
  });
  it("FAIL when captured below the horizon (night)", () => {
    expect(checkSunGlare(frame({ capturedAt: Date.UTC(2023, 5, 21, 7, 0, 0) }), DEFAULT_VALIDATION_CONFIG).status).toBe("FAIL");
  });
  it("WARN when time or GPS is missing", () => {
    expect(checkSunGlare(frame({ capturedAt: null }), DEFAULT_VALIDATION_CONFIG).status).toBe("WARN");
    expect(checkSunGlare(frame({ latitude: null }), DEFAULT_VALIDATION_CONFIG).status).toBe("WARN");
  });
});

describe("checkExposure", () => {
  it("PASS at low ISO + fast shutter", () => {
    expect(checkExposure(frame(), DEFAULT_VALIDATION_CONFIG).status).toBe("PASS");
  });
  it("WARN at elevated ISO", () => {
    expect(checkExposure(frame({ iso: 1600 }), DEFAULT_VALIDATION_CONFIG).status).toBe("WARN");
  });
  it("FAIL at very high ISO", () => {
    expect(checkExposure(frame({ iso: 6400 }), DEFAULT_VALIDATION_CONFIG).status).toBe("FAIL");
  });
  it("FAIL on a slow shutter (motion blur)", () => {
    expect(checkExposure(frame({ exposureTime: 1 / 20 }), DEFAULT_VALIDATION_CONFIG).status).toBe("FAIL");
  });
  it("WARN when exposure metadata is absent", () => {
    expect(checkExposure(frame({ iso: null, exposureTime: null }), DEFAULT_VALIDATION_CONFIG).status).toBe("WARN");
  });
});

describe("checkOverlap", () => {
  it("PASS on the first frame (sequence start)", () => {
    expect(checkOverlap(frame({}, 0), null, DEFAULT_VALIDATION_CONFIG).status).toBe("PASS");
  });
  it("PASS at tight spacing (~80% overlap)", () => {
    const prev = frame({}, 0);
    const cur = frame({ latitude: BASE_LAT + metersToLat(30) }, 1); // 30 m of a 150 m footprint
    expect(checkOverlap(cur, prev, DEFAULT_VALIDATION_CONFIG).status).toBe("PASS");
  });
  it("WARN in the sparse band (~65% overlap)", () => {
    const prev = frame({}, 0);
    const cur = frame({ latitude: BASE_LAT + metersToLat(52.5) }, 1);
    expect(checkOverlap(cur, prev, DEFAULT_VALIDATION_CONFIG).status).toBe("WARN");
  });
  it("FAIL when frames are too far apart (~56% overlap)", () => {
    const prev = frame({}, 0);
    const cur = frame({ latitude: BASE_LAT + metersToLat(66) }, 1);
    expect(checkOverlap(cur, prev, DEFAULT_VALIDATION_CONFIG).status).toBe("FAIL");
  });
  it("WARN when altitude is unavailable", () => {
    const prev = frame({ altitude: null }, 0);
    const cur = frame({ altitude: null, latitude: BASE_LAT + metersToLat(30) }, 1);
    expect(checkOverlap(cur, prev, DEFAULT_VALIDATION_CONFIG).status).toBe("WARN");
  });
});

describe("checkFrame", () => {
  it("PASS when core metadata is present", () => {
    expect(checkFrame(frame()).status).toBe("PASS");
  });
  it("WARN when some metadata is missing", () => {
    expect(checkFrame(frame({ imageWidth: null, imageHeight: null })).status).toBe("WARN");
  });
  it("FAIL when the frame has no usable EXIF at all", () => {
    expect(
      checkFrame(frame({ capturedAt: null, latitude: null, longitude: null, imageWidth: null, imageHeight: null })).status,
    ).toBe("FAIL");
  });
});

describe("validateCaptureSet (whole-set fixtures)", () => {
  it("a nominal line passes every frame", () => {
    const report = validateCaptureSet(line(25, 30), DEFAULT_VALIDATION_CONFIG);
    expect(report.summary.status).toBe("PASS");
    expect(report.summary.counts.PASS).toBe(25);
    expect(report.files.every((f) => f.status === "PASS")).toBe(true);
  });

  it("a sparse, high-ISO, short line surfaces WARN/FAIL and set-level notes", () => {
    const frames = line(5, 66, { iso: 6400 }); // too-far spacing + very high ISO + only 5 frames
    const report = validateCaptureSet(frames, DEFAULT_VALIDATION_CONFIG);
    expect(report.summary.status).toBe("FAIL");
    expect(report.summary.counts.FAIL).toBeGreaterThan(0);
    // set-level: below the minimum frame count
    expect(report.summary.notes.some((n) => /below the .* guide/.test(n))).toBe(true);
  });

  it("flags GPS gaps per-file and in the summary", () => {
    const frames = line(4, 30);
    frames[2] = { ...frames[2], latitude: null, longitude: null };
    const report = validateCaptureSet(frames, DEFAULT_VALIDATION_CONFIG);
    expect(report.files[2].checks.gps.status).toBe("FAIL");
    expect(report.summary.notes.some((n) => /no GPS fix/.test(n))).toBe(true);
  });

  it("detects dropped frames from the filename sequence", () => {
    const frames = line(3, 30);
    frames[1] = { ...frames[1], name: "DJI_0005.JPG" }; // 0000, 0005, 0002 -> gaps
    const report = validateCaptureSet(frames, DEFAULT_VALIDATION_CONFIG);
    expect(report.summary.notes.some((n) => /missing from the filename sequence/.test(n))).toBe(true);
  });

  it("is deterministic — same input, identical report", () => {
    const frames = line(10, 40, { iso: 1600 });
    expect(JSON.stringify(validateCaptureSet(frames))).toBe(JSON.stringify(validateCaptureSet(frames)));
  });
});

describe("checkNdaa (heuristic screen — WARN only, never attestation)", () => {
  it("PASS for a non-covered manufacturer", () => {
    expect(checkNdaa(frame({ make: "Skydio", model: "X10D" }), DEFAULT_VALIDATION_CONFIG).status).toBe("PASS");
  });
  it("WARN for a covered manufacturer (never FAIL)", () => {
    const r = checkNdaa(frame({ make: "DJI", model: "Mavic 3T" }), DEFAULT_VALIDATION_CONFIG);
    expect(r.status).toBe("WARN");
    expect(r.reason).toMatch(/heuristic/i);
  });
  it("WARN when manufacturer is absent (can't screen)", () => {
    expect(checkNdaa(frame({ make: null, model: null }), DEFAULT_VALIDATION_CONFIG).status).toBe("WARN");
  });
});

describe("checkAirframe (verified-airframe screen — fail closed)", () => {
  it("PASS for a verified serial", () => {
    expect(checkAirframe(frame({ serialNumber: "DZ-THERMAL-0001" }), REGISTRY).status).toBe("PASS");
  });
  it("FAIL for a registered-but-unverified serial", () => {
    expect(checkAirframe(frame({ serialNumber: "DZ-THERMAL-9999" }), REGISTRY).status).toBe("FAIL");
  });
  it("FAIL for an unknown serial", () => {
    expect(checkAirframe(frame({ serialNumber: "NOPE-0000" }), REGISTRY).status).toBe("FAIL");
  });
  it("WARN when no serial is present (server will bind authoritatively)", () => {
    expect(checkAirframe(frame({ serialNumber: null }), REGISTRY).status).toBe("WARN");
  });
});

describe("validateCaptureSet with a registry — upload eligibility gate (M1-06)", () => {
  it("verified airframe: hardware checks pass, frames stay upload-eligible", () => {
    const report = validateCaptureSet(line(3, 30), DEFAULT_VALIDATION_CONFIG, REGISTRY);
    expect(report.files.every((f) => f.hardware?.airframe.status === "PASS")).toBe(true);
    expect(report.files.every((f) => f.uploadEligible)).toBe(true);
    expect(report.summary.eligible).toBe(3);
  });

  it("unverified airframe: every frame FAILs the airframe check and is NOT upload-eligible", () => {
    const report = validateCaptureSet(line(3, 30, { serialNumber: "DZ-THERMAL-9999" }), DEFAULT_VALIDATION_CONFIG, REGISTRY);
    expect(report.files.every((f) => f.hardware?.airframe.status === "FAIL")).toBe(true);
    expect(report.files.every((f) => f.uploadEligible === false)).toBe(true);
    expect(report.summary.eligible).toBe(0);
  });

  it("a covered manufacturer with a verified airframe WARNs but stays eligible (WARN != FAIL)", () => {
    const report = validateCaptureSet(line(2, 30, { make: "DJI", model: "Matrice" }), DEFAULT_VALIDATION_CONFIG, REGISTRY);
    expect(report.files.every((f) => f.hardware?.ndaa.status === "WARN")).toBe(true);
    expect(report.files.every((f) => f.uploadEligible)).toBe(true); // verified serial -> WARN overall
  });

  it("without a registry there are no hardware checks (M1-05 behavior preserved)", () => {
    const report = validateCaptureSet(line(3, 30), DEFAULT_VALIDATION_CONFIG);
    expect(report.files.every((f) => f.hardware === undefined)).toBe(true);
  });

  it("folds an optional telemetry note into the summary", () => {
    const registry: RegistryScreen = {
      ...REGISTRY,
      telemetry: { logName: "flight.log", serial: "DZ-THERMAL-0001", status: "VERIFIED", message: "Telemetry serial matches a verified airframe." },
    };
    const report = validateCaptureSet(line(2, 30), DEFAULT_VALIDATION_CONFIG, registry);
    expect(report.summary.notes.some((n) => /Telemetry serial/.test(n))).toBe(true);
  });
});
