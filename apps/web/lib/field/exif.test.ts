import { describe, it, expect } from "vitest";
import { frameFromExif, toMillis, type ExifData } from "./exif";

// A representative drone EXIF object (the shape exifr returns with { gps: true }).
const DRONE_EXIF: ExifData = {
  DateTimeOriginal: new Date("2023-06-21T19:00:00Z"),
  latitude: 33.5,
  longitude: -111.9,
  GPSAltitude: 92.4,
  FocalLengthIn35mmFormat: 24,
  ExposureTime: 1 / 500,
  ISO: 200,
  FNumber: 5.6,
  ExifImageWidth: 5472,
  ExifImageHeight: 3648,
  Make: "Skydio",
  Model: "X10D",
  SerialNumber: "DZ-THERMAL-0001",
};

describe("toMillis", () => {
  it("handles Date, ISO string, and epoch ms", () => {
    expect(toMillis(new Date("2023-06-21T19:00:00Z"))).toBe(Date.UTC(2023, 5, 21, 19, 0, 0));
    expect(toMillis("2023-06-21T19:00:00Z")).toBe(Date.UTC(2023, 5, 21, 19, 0, 0));
    expect(toMillis(1_687_374_000_000)).toBe(1_687_374_000_000);
  });
  it("returns null for missing / invalid input", () => {
    expect(toMillis(undefined)).toBeNull();
    expect(toMillis("not a date")).toBeNull();
    expect(toMillis(new Date("nope"))).toBeNull();
  });
});

describe("frameFromExif", () => {
  it("maps a full drone EXIF object", () => {
    const f = frameFromExif("DJI_0001.JPG", 8_000_000, 0, DRONE_EXIF);
    expect(f).toMatchObject({
      name: "DJI_0001.JPG",
      index: 0,
      size: 8_000_000,
      capturedAt: Date.UTC(2023, 5, 21, 19, 0, 0),
      latitude: 33.5,
      longitude: -111.9,
      altitude: 92.4,
      focalLength35: 24,
      exposureTime: 1 / 500,
      iso: 200,
      imageWidth: 5472,
      imageHeight: 3648,
      make: "Skydio",
      model: "X10D",
      serialNumber: "DZ-THERMAL-0001",
    });
  });

  it("degrades gracefully to nulls when EXIF is absent (no throw)", () => {
    const f = frameFromExif("IMG_0002.JPG", 1234, 2, null);
    expect(f.name).toBe("IMG_0002.JPG");
    expect(f.index).toBe(2);
    expect(f.capturedAt).toBeNull();
    expect(f.latitude).toBeNull();
    expect(f.iso).toBeNull();
    expect(f.imageWidth).toBeNull();
  });

  it("falls back to CreateDate and ImageWidth/Height aliases", () => {
    const f = frameFromExif("a.jpg", 10, 0, {
      CreateDate: "2023-01-02T03:04:05Z",
      ImageWidth: 4000,
      ImageHeight: 3000,
      BodySerialNumber: "SN-ALT-77",
    });
    expect(f.capturedAt).toBe(Date.UTC(2023, 0, 2, 3, 4, 5));
    expect(f.imageWidth).toBe(4000);
    expect(f.imageHeight).toBe(3000);
    expect(f.serialNumber).toBe("SN-ALT-77");
  });
});
