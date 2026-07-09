import { describe, it, expect } from "vitest";
import {
  captureQualityReason,
  parseCaptureQualityCallback,
  toCaptureQualityEventDTO,
  toUnsupportedFormatDTO,
  unsupportedFormatLabel,
  CAPTURE_QUALITY_STATUSES,
} from "./reason";

// Verdict language is a HARD STOP in any client-facing output (CR-12).
const VERDICT_WORDS = ["violation", "breach", "back-charge", "penalty", "liable", "enforce"];

function assertEvidenceFramed(copy: string) {
  const low = copy.toLowerCase();
  for (const w of VERDICT_WORDS) expect(low).not.toContain(w);
}

describe("captureQualityReason — evidence-framed + actionable (CR-12)", () => {
  it("colorized/non-radiometric reads as an observation + a re-capture action", () => {
    const r = captureQualityReason("NO_RADIOMETRIC_CHANNEL");
    expect(r).toMatch(/non-radiometric/i);
    expect(r).toMatch(/re-capture/i);
    assertEvidenceFramed(r);
  });

  it("unknown format names the supported radiometric modes to re-capture in", () => {
    const r = captureQualityReason("UNKNOWN_FORMAT");
    expect(r).toMatch(/unrecognized capture format/i);
    expect(r).toMatch(/FLIR|TIFF|DJI/);
    assertEvidenceFramed(r);
  });

  it("no status produces verdict language", () => {
    for (const s of CAPTURE_QUALITY_STATUSES) assertEvidenceFramed(captureQualityReason(s));
  });
});

describe("parseCaptureQualityCallback — validate + normalize, fail closed", () => {
  const good = {
    ingestion_session_id: "s1",
    organization_id: "o1",
    status: "NO_RADIOMETRIC_CHANNEL",
    manufacturer: "DJI",
    model: "Zenmuse H20T",
    detected_format: null,
    format_fingerprint: "JPEG",
  };

  it("accepts a well-formed body and derives the reason (payload reason is ignored)", () => {
    const r = parseCaptureQualityCallback({ ...good, reason: "attacker-supplied verdict text" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ingestionSessionId).toBe("s1");
    expect(r.value.organizationId).toBe("o1");
    expect(r.value.status).toBe("NO_RADIOMETRIC_CHANNEL");
    expect(r.value.manufacturer).toBe("DJI");
    expect(r.value.model).toBe("Zenmuse H20T");
    expect(r.value.formatFingerprint).toBe("JPEG");
    // reason is DERIVED, not taken from the payload — single source of truth.
    expect(r.value.reason).toBe(captureQualityReason("NO_RADIOMETRIC_CHANNEL"));
    expect(r.value.reason).not.toContain("attacker");
  });

  it("rejects a missing session, org, or unknown status", () => {
    expect(parseCaptureQualityCallback({ ...good, ingestion_session_id: "" }).ok).toBe(false);
    expect(parseCaptureQualityCallback({ ...good, organization_id: undefined }).ok).toBe(false);
    expect(parseCaptureQualityCallback({ ...good, status: "PENDING_QA" }).ok).toBe(false);
    expect(parseCaptureQualityCallback(null).ok).toBe(false);
  });

  it("optional fields default to null", () => {
    const r = parseCaptureQualityCallback({
      ingestion_session_id: "s2",
      organization_id: "o1",
      status: "UNKNOWN_FORMAT",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.manufacturer).toBeNull();
    expect(r.value.model).toBeNull();
    expect(r.value.detectedFormat).toBeNull();
    expect(r.value.formatFingerprint).toBeNull();
  });
});

describe("toCaptureQualityEventDTO — pure row → DTO", () => {
  it("serializes createdAt and carries the fingerprint + evidence-framed reason", () => {
    const dto = toCaptureQualityEventDTO({
      id: "e1",
      ingestionSessionId: "s1",
      status: "NO_RADIOMETRIC_CHANNEL",
      reason: captureQualityReason("NO_RADIOMETRIC_CHANNEL"),
      manufacturer: "DJI",
      model: null,
      detectedFormat: null,
      formatFingerprint: "JPEG",
      createdAt: new Date("2026-07-08T18:00:00Z"),
    });
    expect(dto.createdAt).toBe("2026-07-08T18:00:00.000Z");
    expect(dto.status).toBe("NO_RADIOMETRIC_CHANNEL");
    expect(dto.formatFingerprint).toBe("JPEG");
    assertEvidenceFramed(dto.reason);
  });
});

describe("unsupported-format demand signal (M2-1f)", () => {
  it("toUnsupportedFormatDTO extracts the group count", () => {
    const dto = toUnsupportedFormatDTO({
      manufacturer: "Autel Robotics",
      model: "EVO II 640T",
      formatFingerprint: "TIFF",
      _count: { id: 7 },
    });
    expect(dto).toEqual({
      manufacturer: "Autel Robotics",
      model: "EVO II 640T",
      formatFingerprint: "TIFF",
      count: 7,
    });
  });

  it("unsupportedFormatLabel is evidence-framed and names the device + container", () => {
    const label = unsupportedFormatLabel({
      manufacturer: "Autel Robotics",
      model: "EVO II 640T",
      formatFingerprint: "TIFF",
      count: 7,
    });
    expect(label).toContain("Autel Robotics");
    expect(label).toContain("EVO II 640T");
    expect(label).toContain("TIFF");
    assertEvidenceFramed(label);
  });

  it("falls back gracefully when the maker/model/fingerprint are unknown", () => {
    const label = unsupportedFormatLabel({ manufacturer: null, model: null, formatFingerprint: null, count: 3 });
    expect(label).toMatch(/unknown maker/i);
    expect(label).toMatch(/unrecognized container/i);
    assertEvidenceFramed(label);
  });
});
