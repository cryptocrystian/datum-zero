import exifr from "exifr";
import { frameFromExif } from "../../lib/field/exif";
import { validateCaptureSet, DEFAULT_VALIDATION_CONFIG, type FrameMeta } from "../../lib/field/validation";
import type { ValidationInMessage, ValidationOutMessage } from "./validation-protocol";

/**
 * Validation Web Worker (M1-05) — runs the zero-trash firewall OFF THE MAIN THREAD so parsing EXIF
 * over a large capture set never freezes the field UI. It does only the impure work (read bytes,
 * parse EXIF); all decision logic lives in the pure, tested lib/field/validation.ts.
 */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ValidationInMessage>) => void) | null;
  postMessage: (msg: ValidationOutMessage) => void;
};

// Pull the tags the checks need (timestamp, GPS+altitude, focal length, exposure, dimensions).
// ifd0 is always parsed by exifr and cannot be toggled, so it is omitted here.
const EXIF_OPTS = { gps: true, tiff: true, exif: true, xmp: true } as const;

ctx.onmessage = async (e) => {
  const { files } = e.data;
  const frames: FrameMeta[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let exif = null;
    try {
      exif = await exifr.parse(file, EXIF_OPTS);
    } catch {
      exif = null; // unreadable EXIF is data itself — the frame/gps checks will flag it
    }
    frames.push(frameFromExif(file.name, file.size, i, exif));
    ctx.postMessage({ type: "progress", done: i + 1, total: files.length });
  }
  ctx.postMessage({ type: "done", report: validateCaptureSet(frames, DEFAULT_VALIDATION_CONFIG) });
};
