import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import exifr from "exifr";
import { frameFromExif } from "./exif";
import { validateCaptureSet, type FrameMeta } from "./validation";

/**
 * End-to-end over real sample-image fixtures: parse EXIF with exifr (the same call the worker makes),
 * map to FrameMeta, then screen the set. The four DJI_*.JPG fixtures carry written EXIF:
 *   0001/0002 — GPS 33.5,-111.9 @100 m, ISO 200, 1/500, 24mm-equiv  (clean)
 *   0003      — ISO 6400 + 1/8s shutter                              (exposure problem)
 *   0004      — no GPS                                               (gps gap)
 *
 * Assertions are TIMEZONE-INDEPENDENT only. EXIF DateTimeOriginal has no timezone, so the derived
 * capture instant (and thus the sun-elevation check) depends on the runner's locale — the pure unit
 * tests cover sun banding deterministically instead.
 */
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const NAMES = ["DJI_0001.JPG", "DJI_0002.JPG", "DJI_0003.JPG", "DJI_0004.JPG"];

async function parseFixtures(): Promise<FrameMeta[]> {
  const frames: FrameMeta[] = [];
  for (let i = 0; i < NAMES.length; i++) {
    const buf = readFileSync(path.join(DIR, NAMES[i]));
    const exif = await exifr.parse(buf, { gps: true, tiff: true, exif: true });
    frames.push(frameFromExif(NAMES[i], buf.length, i, exif));
  }
  return frames;
}

describe("validation pipeline over sample-image fixtures (real EXIF via exifr)", () => {
  it("recovers EXIF (GPS, ISO, focal length) from the sample images", async () => {
    const frames = await parseFixtures();
    expect(frames[0].latitude).toBeCloseTo(33.5, 3);
    expect(frames[0].longitude).toBeCloseTo(-111.9, 3);
    expect(frames[0].altitude).toBe(100);
    expect(frames[0].iso).toBe(200);
    expect(frames[0].focalLength35).toBe(24);
    expect(frames[0].make).toBe("DJI"); // hardware-screening tag (M1-06)
    expect(frames[3].latitude).toBeNull(); // DJI_0004 was written without GPS
  });

  it("screens the set — exposure FAIL on the high-ISO frame, GPS FAIL on the no-GPS frame", async () => {
    const report = await validateCaptureSet(await parseFixtures());
    expect(report.files[2].checks.exposure.status).toBe("FAIL"); // ISO 6400 + 1/8s
    expect(report.files[3].checks.gps.status).toBe("FAIL"); // no GPS
    expect(report.summary.notes.some((n) => /no GPS fix/.test(n))).toBe(true);
    expect(report.summary.notes.some((n) => /below the .* guide/.test(n))).toBe(true); // only 4 frames
  });
});
