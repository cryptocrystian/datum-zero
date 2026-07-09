import type { FrameMeta } from "./validation";

/**
 * Pure mapping from an exifr parse result to our FrameMeta (M1-05). The impure `exifr.parse(file)`
 * call lives in the worker (app/field/validation.worker.ts); this mapping is kept separate so it is
 * unit-testable over fixture EXIF objects with no I/O.
 */
export interface ExifData {
  DateTimeOriginal?: Date | string | number;
  CreateDate?: Date | string | number;
  latitude?: number; // exifr computes decimal lat/lon when { gps: true }
  longitude?: number;
  GPSAltitude?: number;
  FocalLengthIn35mmFormat?: number;
  ExposureTime?: number;
  ISO?: number;
  FNumber?: number;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  ImageWidth?: number;
  ImageHeight?: number;
  // hardware-screening tags (M1-06)
  Make?: string;
  Model?: string;
  SerialNumber?: string;
  BodySerialNumber?: string;
}

function numOrNull(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function strOrNull(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x.trim() : null;
}

/** EXIF DateTimeOriginal (Date | ISO string | epoch ms) -> ms epoch, else null. */
export function toMillis(v: Date | string | number | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function frameFromExif(
  name: string,
  size: number,
  index: number,
  exif: ExifData | null | undefined,
  radiometricFormat: string | null = null,
): FrameMeta {
  return {
    name,
    size,
    index,
    capturedAt: toMillis(exif?.DateTimeOriginal ?? exif?.CreateDate),
    latitude: numOrNull(exif?.latitude),
    longitude: numOrNull(exif?.longitude),
    altitude: numOrNull(exif?.GPSAltitude),
    focalLength35: numOrNull(exif?.FocalLengthIn35mmFormat),
    exposureTime: numOrNull(exif?.ExposureTime),
    iso: numOrNull(exif?.ISO),
    fNumber: numOrNull(exif?.FNumber),
    imageWidth: numOrNull(exif?.ExifImageWidth ?? exif?.ImageWidth),
    imageHeight: numOrNull(exif?.ExifImageHeight ?? exif?.ImageHeight),
    make: strOrNull(exif?.Make),
    model: strOrNull(exif?.Model),
    serialNumber: strOrNull(exif?.SerialNumber ?? exif?.BodySerialNumber),
    radiometricFormat,
  };
}
