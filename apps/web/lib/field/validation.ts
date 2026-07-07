/**
 * Infield Validator — client-side validation pipeline (M1-05, CR-11).
 *
 * The "zero-trash firewall": screen a staged capture set for DATA-QUALITY problems before it ever
 * leaves the device. This module is PURE and DETERMINISTIC — it takes already-extracted per-frame
 * metadata (see lib/field/exif.ts) and returns PASS/WARN/FAIL per check with a human reason. No DOM,
 * no File, no I/O, no clock/random — so it is unit-testable over sample capture-set fixtures.
 *
 * Language is EVIDENCE-FRAMED (CR-12): measurements + "review/re-shoot recommended", never a
 * verdict. This is a data-quality screen, never an attestation of anything (CR-11).
 */

export type CheckStatus = "PASS" | "WARN" | "FAIL";
export type CheckKey = "frame" | "gps" | "sunGlare" | "exposure" | "overlap";

export interface CheckResult {
  status: CheckStatus;
  reason: string;
}

/** Per-frame metadata extracted from EXIF/XMP (lib/field/exif.ts). All fields best-effort/nullable. */
export interface FrameMeta {
  name: string;
  index: number; // position in the staged capture sequence (0-based)
  size: number; // bytes
  capturedAt: number | null; // ms epoch, treated as UTC (EXIF tz is ambiguous — see note below)
  latitude: number | null;
  longitude: number | null;
  altitude: number | null; // meters
  focalLength35: number | null; // 35mm-equivalent focal length, mm
  exposureTime: number | null; // seconds
  iso: number | null;
  fNumber: number | null;
  imageWidth: number | null; // px
  imageHeight: number | null; // px
}

export interface FileResult {
  name: string;
  index: number;
  status: CheckStatus; // worst of the individual checks
  checks: Record<CheckKey, CheckResult>;
}

export interface RunSummary {
  total: number;
  counts: Record<CheckStatus, number>; // by worst-per-file status
  status: CheckStatus; // overall worst
  notes: string[]; // set-level, evidence-framed observations
}

export interface ValidationReport {
  files: FileResult[];
  summary: RunSummary;
}

export interface ValidationConfig {
  /** Sun elevation (deg above horizon) below which low-angle glare is flagged. */
  sunGlareWarnBelowDeg: number;
  sunGlareFailBelowDeg: number;
  /** Forward overlap (%) below which coverage is flagged insufficient. */
  overlapForwardWarnPct: number;
  overlapForwardFailPct: number;
  /** Horizontal field of view (deg) used when 35mm-equiv focal length is unavailable. */
  defaultHorizontalFovDeg: number;
  /** Exposure proxies: high ISO → noise, slow shutter → motion blur. */
  isoWarnAbove: number;
  isoFailAbove: number;
  exposureTimeWarnAboveSec: number;
  exposureTimeFailAboveSec: number;
  /** Minimum frame count for a usable set. */
  minFrameCount: number;
}

/**
 * PROVISIONAL defaults — SAME POSTURE AS CR-19. These thresholds are placeholders pending field
 * calibration against real capture sets (site, airframe, sensor, and mission profile all shift
 * them). Treat as configurable defaults; tune per deployment before any client-facing screening.
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  sunGlareWarnBelowDeg: 20,
  sunGlareFailBelowDeg: 10,
  overlapForwardWarnPct: 70,
  overlapForwardFailPct: 60,
  defaultHorizontalFovDeg: 73.7, // ~24mm-equivalent wide lens
  isoWarnAbove: 800,
  isoFailAbove: 3200,
  exposureTimeWarnAboveSec: 1 / 100,
  exposureTimeFailAboveSec: 1 / 50,
  minFrameCount: 20,
};

const RAD = Math.PI / 180;
const rank: Record<CheckStatus, number> = { PASS: 0, WARN: 1, FAIL: 2 };

function worstOf(statuses: CheckStatus[]): CheckStatus {
  return statuses.reduce<CheckStatus>((acc, s) => (rank[s] > rank[acc] ? s : acc), "PASS");
}

function hasGps(f: FrameMeta): boolean {
  return f.latitude != null && f.longitude != null && !(f.latitude === 0 && f.longitude === 0);
}

/** Haversine great-circle distance in meters. Pure. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Solar elevation angle (deg above horizon) for a UTC instant + location. Low-precision NOAA /
 * Astronomical-Almanac algorithm (accurate to ~0.01° for the current era) — enough to flag
 * low-angle light. NOTE: EXIF capture time carries no reliable timezone, so `utcMillis` is treated
 * as UTC; an unknown local offset shifts the result. This is an approximation, per the provisional
 * posture above. Pure/deterministic.
 */
export function solarElevationDeg(utcMillis: number, latDeg: number, lonDeg: number): number {
  const jd = utcMillis / 86400000 + 2440587.5;
  const n = jd - 2451545.0; // days since J2000.0
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360; // mean longitude
  const g = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) * RAD; // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const epsilon = (23.439 - 0.0000004 * n) * RAD; // obliquity
  const delta = Math.asin(Math.sin(epsilon) * Math.sin(lambda)); // declination
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) / RAD; // right ascension, deg
  const gmst = ((280.46061837 + 360.98564736629 * n) % 360 + 360) % 360;
  let H = (gmst + lonDeg - ra) % 360; // local hour angle, deg
  if (H < -180) H += 360;
  if (H > 180) H -= 360;
  const latR = latDeg * RAD;
  const elev = Math.asin(
    Math.sin(latR) * Math.sin(delta) + Math.cos(latR) * Math.cos(delta) * Math.cos(H * RAD),
  );
  return elev / RAD;
}

/** Horizontal field of view (deg) from a 35mm-equivalent focal length (36mm full-frame width). */
function horizontalFovDeg(focal35: number | null): number | null {
  if (focal35 == null || focal35 <= 0) return null;
  return (2 * Math.atan(36 / (2 * focal35))) / RAD;
}

function fmtShutter(sec: number): string {
  return sec >= 1 ? `${sec.toFixed(1)}s` : `1/${Math.round(1 / sec)}s`;
}

// --- individual checks (each pure: FrameMeta [+ prev] [+ config] -> CheckResult) ---

/** (5) Frame completeness — does this frame carry the core metadata to be screened at all? */
export function checkFrame(f: FrameMeta): CheckResult {
  const missing: string[] = [];
  if (f.capturedAt == null) missing.push("timestamp");
  if (!hasGps(f)) missing.push("GPS");
  if (f.imageWidth == null || f.imageHeight == null) missing.push("dimensions");
  if (missing.length === 0) return { status: "PASS", reason: "Frame metadata complete." };
  if (f.capturedAt == null && !hasGps(f) && f.imageWidth == null) {
    return { status: "FAIL", reason: "No usable EXIF metadata on this frame." };
  }
  return { status: "WARN", reason: `Frame metadata incomplete — missing ${missing.join(", ")}.` };
}

/** (3) GPS gaps — missing or null-island coordinates. */
export function checkGps(f: FrameMeta): CheckResult {
  if (f.latitude == null || f.longitude == null) {
    return { status: "FAIL", reason: "No GPS coordinates recorded in EXIF." };
  }
  if (f.latitude === 0 && f.longitude === 0) {
    return { status: "FAIL", reason: "GPS reads 0.000000, 0.000000 — position not recorded." };
  }
  if (f.altitude == null) {
    return {
      status: "WARN",
      reason: `GPS ${f.latitude.toFixed(6)}, ${f.longitude.toFixed(6)}; altitude missing (overlap estimate degraded).`,
    };
  }
  return { status: "PASS", reason: `GPS ${f.latitude.toFixed(6)}, ${f.longitude.toFixed(6)}.` };
}

/** (1) Sun-glare risk — low sun elevation from capture time + GPS. */
export function checkSunGlare(f: FrameMeta, config: ValidationConfig): CheckResult {
  if (f.capturedAt == null) return { status: "WARN", reason: "Capture time missing — sun angle not computed." };
  if (!hasGps(f)) return { status: "WARN", reason: "No GPS — sun angle not computed." };
  const elev = solarElevationDeg(f.capturedAt, f.latitude!, f.longitude!);
  const e = elev.toFixed(1);
  if (elev < 0) return { status: "FAIL", reason: `Sun below horizon (${e}°) — captured outside daylight.` };
  if (elev < config.sunGlareFailBelowDeg) {
    return { status: "FAIL", reason: `Sun elevation ${e}° — strong low-angle glare risk; shoot nearer solar noon.` };
  }
  if (elev < config.sunGlareWarnBelowDeg) {
    return { status: "WARN", reason: `Sun elevation ${e}° — low-angle glare risk.` };
  }
  return { status: "PASS", reason: `Sun elevation ${e}°.` };
}

/** (4) Exposure proxy — high ISO (noise) / slow shutter (motion blur) from EXIF. */
export function checkExposure(f: FrameMeta, config: ValidationConfig): CheckResult {
  if (f.iso == null && f.exposureTime == null) {
    return { status: "WARN", reason: "Exposure metadata (ISO / shutter) absent." };
  }
  const parts: string[] = [];
  let status: CheckStatus = "PASS";
  if (f.iso != null) {
    if (f.iso > config.isoFailAbove) {
      status = worstOf([status, "FAIL"]);
      parts.push(`ISO ${f.iso} very high — heavy sensor noise likely`);
    } else if (f.iso > config.isoWarnAbove) {
      status = worstOf([status, "WARN"]);
      parts.push(`ISO ${f.iso} elevated — noise risk`);
    }
  }
  if (f.exposureTime != null) {
    if (f.exposureTime > config.exposureTimeFailAboveSec) {
      status = worstOf([status, "FAIL"]);
      parts.push(`shutter ${fmtShutter(f.exposureTime)} slow — motion blur likely`);
    } else if (f.exposureTime > config.exposureTimeWarnAboveSec) {
      status = worstOf([status, "WARN"]);
      parts.push(`shutter ${fmtShutter(f.exposureTime)} — motion blur risk`);
    }
  }
  if (status === "PASS") {
    const iso = f.iso != null ? `ISO ${f.iso}` : "ISO —";
    const sh = f.exposureTime != null ? `shutter ${fmtShutter(f.exposureTime)}` : "shutter —";
    return { status, reason: `${iso}, ${sh}.` };
  }
  return { status, reason: `${parts.join("; ")}.` };
}

/** (2) Overlap approximation — forward overlap vs. the preceding frame from GPS spacing + altitude + FOV. */
export function checkOverlap(f: FrameMeta, prev: FrameMeta | null, config: ValidationConfig): CheckResult {
  if (f.index === 0 || prev == null) {
    return { status: "PASS", reason: "Sequence start — no preceding frame." };
  }
  if (!hasGps(f) || !hasGps(prev)) {
    return { status: "WARN", reason: "Overlap not computed — GPS missing on this or the previous frame." };
  }
  const alt = f.altitude ?? prev.altitude;
  if (alt == null || alt <= 0) {
    return { status: "WARN", reason: "Overlap not computed — altitude unavailable." };
  }
  const fov = horizontalFovDeg(f.focalLength35) ?? config.defaultHorizontalFovDeg;
  const footprint = 2 * alt * Math.tan((fov / 2) * RAD); // meters across the frame
  const d = haversineMeters(prev.latitude!, prev.longitude!, f.latitude!, f.longitude!);
  const overlapPct = footprint > 0 ? (1 - d / footprint) * 100 : -Infinity;
  const shown = Math.max(0, Math.round(overlapPct));
  if (overlapPct < config.overlapForwardFailPct) {
    return { status: "FAIL", reason: `Forward overlap ~${shown}% — below ${config.overlapForwardFailPct}% target; coverage gaps likely.` };
  }
  if (overlapPct < config.overlapForwardWarnPct) {
    return { status: "WARN", reason: `Forward overlap ~${shown}% — below ${config.overlapForwardWarnPct}% target.` };
  }
  return { status: "PASS", reason: `Forward overlap ~${shown}%.` };
}

/** Extract a trailing frame number from a filename (e.g. DJI_0042.JPG -> 42) for gap detection. */
function frameNumber(name: string): number | null {
  const m = name.match(/(\d+)(?=\.[^.]+$)/);
  return m ? parseInt(m[1], 10) : null;
}

function buildNotes(frames: FrameMeta[], files: FileResult[], config: ValidationConfig): string[] {
  const notes: string[] = [];
  if (frames.length < config.minFrameCount) {
    notes.push(`${frames.length} frames staged — below the ${config.minFrameCount}-frame guide for a usable set.`);
  }
  const gpsGaps = files.filter((f) => f.checks.gps.status === "FAIL").length;
  if (gpsGaps > 0) notes.push(`${gpsGaps} of ${frames.length} frames have no GPS fix.`);

  const overlaps = files
    .map((f, i) => (i > 0 ? f.checks.overlap : null))
    .filter((c): c is CheckResult => c != null && /~(\d+)%/.test(c.reason))
    .map((c) => parseInt(c.reason.match(/~(\d+)%/)![1], 10));
  if (overlaps.length > 0) {
    const sorted = [...overlaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    notes.push(`Median forward overlap ~${median}% across ${overlaps.length} frame pairs.`);
  }

  const nums = frames.map((f) => frameNumber(f.name)).filter((n): n is number => n != null);
  if (nums.length >= 2) {
    const sorted = [...nums].sort((a, b) => a - b);
    let gaps = 0;
    for (let i = 1; i < sorted.length; i++) gaps += Math.max(0, sorted[i] - sorted[i - 1] - 1);
    if (gaps > 0) notes.push(`${gaps} frame number(s) missing from the filename sequence — possible dropped frames.`);
  }
  return notes;
}

/** Validate a staged capture set (frames in capture order). Pure + deterministic. */
export function validateCaptureSet(
  frames: FrameMeta[],
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
): ValidationReport {
  const files: FileResult[] = frames.map((f, i) => {
    const prev = i > 0 ? frames[i - 1] : null;
    const checks: Record<CheckKey, CheckResult> = {
      frame: checkFrame(f),
      gps: checkGps(f),
      sunGlare: checkSunGlare(f, config),
      exposure: checkExposure(f, config),
      overlap: checkOverlap(f, prev, config),
    };
    const status = worstOf(Object.values(checks).map((c) => c.status));
    return { name: f.name, index: f.index, status, checks };
  });

  const counts: Record<CheckStatus, number> = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const f of files) counts[f.status] += 1;

  return {
    files,
    summary: {
      total: frames.length,
      counts,
      status: worstOf(files.map((f) => f.status)),
      notes: buildNotes(frames, files, config),
    },
  };
}
