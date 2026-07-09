import { describe, it, expect } from "vitest";
import { sniffRadiometricFormat, isJpeg, isTiff, hasFlirApp1 } from "./radiometric";
import { checkRadiometric, type FrameMeta } from "./validation";

const JPEG_SOI = [0xff, 0xd8, 0xff, 0xe1];
const TIFF_LE = [0x49, 0x49, 0x2a, 0x00];
const bytes = (...xs: number[]) => new Uint8Array(xs);

function jpegWith(marker: string): Uint8Array {
  const head = [...JPEG_SOI];
  for (const ch of marker) head.push(ch.charCodeAt(0));
  head.push(0x00); // FLIR\0 terminator
  return new Uint8Array(head);
}

describe("sniffRadiometricFormat — mirrors RadiometricPort.sniff (fast pre-filter)", () => {
  it("FLIR maker JPEG → FLIR_RJPEG", () => {
    expect(sniffRadiometricFormat(bytes(...JPEG_SOI), "FLIR Systems AB")).toBe("FLIR_RJPEG");
  });

  it("JPEG carrying a FLIR APP1 segment → FLIR_RJPEG (even without a FLIR maker)", () => {
    expect(sniffRadiometricFormat(jpegWith("FLIR"), "Generic")).toBe("FLIR_RJPEG");
    expect(hasFlirApp1(jpegWith("FLIR"))).toBe(true);
  });

  it("TIFF container → RADIOMETRIC_TIFF", () => {
    expect(sniffRadiometricFormat(bytes(...TIFF_LE), null)).toBe("RADIOMETRIC_TIFF");
    expect(isTiff(bytes(...TIFF_LE))).toBe(true);
  });

  it("DJI maker JPEG → DJI_RJPEG", () => {
    expect(sniffRadiometricFormat(bytes(...JPEG_SOI), "DJI")).toBe("DJI_RJPEG");
  });

  it("plain colorized JPEG (no FLIR/DJI maker, no FLIR segment) → null", () => {
    expect(sniffRadiometricFormat(bytes(...JPEG_SOI), "Skydio")).toBeNull();
    expect(isJpeg(bytes(...JPEG_SOI))).toBe(true);
  });

  it("garbage / empty → null", () => {
    expect(sniffRadiometricFormat(bytes(0x00, 0x01, 0x02), "Whatever")).toBeNull();
    expect(sniffRadiometricFormat(new Uint8Array(), null)).toBeNull();
  });
});

describe("checkRadiometric — edge fail-closed on a clearly non-radiometric capture (CR-11/CR-22)", () => {
  const f = (radiometricFormat: string | null) => ({ radiometricFormat } as unknown as FrameMeta);

  it("no radiometric signature → FAIL with an evidence-framed, actionable reason", () => {
    const r = checkRadiometric(f(null));
    expect(r.status).toBe("FAIL");
    expect(r.reason).toMatch(/non-radiometric/i);
    expect(r.reason).toMatch(/re-capture/i);
    // evidence-framed — no verdict language (CR-12).
    for (const w of ["violation", "breach", "penalty", "liable"]) {
      expect(r.reason.toLowerCase()).not.toContain(w);
    }
  });

  it("a radiometric signature present → PASS (server decode stays authoritative)", () => {
    expect(checkRadiometric(f("FLIR_RJPEG")).status).toBe("PASS");
    expect(checkRadiometric(f("RADIOMETRIC_TIFF")).status).toBe("PASS");
    expect(checkRadiometric(f("DJI_RJPEG")).status).toBe("PASS");
  });
});
