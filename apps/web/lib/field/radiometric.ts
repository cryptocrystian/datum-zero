/**
 * Infield Validator — client-side radiometric-presence sniff (M2-1d, CR-11/CR-22).
 *
 * A fast PRE-FILTER that mirrors the inference `RadiometricPort.sniff`: it detects a radiometric
 * SIGNATURE from head bytes + the EXIF maker (FLIR maker / FLIR APP1 segment / TIFF container / DJI
 * R-JPEG) — it is NOT a full decode. The SERVER decode stays authoritative: a file the client can't
 * classify still uploads and the server fail-closes. The goal here is to catch the obvious wasted
 * upload — a plain colorized JPEG with no thermal payload — at the edge.
 *
 * Pure + deterministic (byte + string in, format-or-null out) so it is unit-testable with no I/O.
 */
import type { RadiometricFormat } from "../quality/reason";

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

export function isTiff(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const b = bytes;
  const littleEndian = b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00; // "II*\0"
  const bigEndian = b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a; // "MM\0*"
  return littleEndian || bigEndian;
}

/** Scan the head for the ASCII marker "FLIR\0" (mirrors the RadiometricPort FLIR APP1 sniff). */
export function hasFlirApp1(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 65536);
  // F  L  I  R  \0
  for (let i = 0; i + 4 < limit; i++) {
    if (bytes[i] === 0x46 && bytes[i + 1] === 0x4c && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x52 && bytes[i + 4] === 0x00) {
      return true;
    }
  }
  return false;
}

/**
 * Sniff the candidate radiometric format, or null if the capture is clearly non-radiometric. Order
 * mirrors RadiometricPort's registry: specific makers before generic containers (FLIR, TIFF, DJI).
 */
export function sniffRadiometricFormat(headBytes: Uint8Array, make: string | null): RadiometricFormat | null {
  const m = (make ?? "").toUpperCase();
  const jpeg = isJpeg(headBytes);
  if (jpeg && (m.includes("FLIR") || hasFlirApp1(headBytes))) return "FLIR_RJPEG";
  if (isTiff(headBytes)) return "RADIOMETRIC_TIFF";
  if (jpeg && m.includes("DJI")) return "DJI_RJPEG";
  return null;
}
