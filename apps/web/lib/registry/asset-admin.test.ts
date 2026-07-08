import { describe, it, expect } from "vitest";
import { isCanonicalLabel, validateCoordString, validateAssetInput, parseAssetCsv, type AssetInput } from "./asset-admin";

const asset = (over: Partial<AssetInput> = {}): AssetInput => ({
  internalLabel: "APEX_SOLAR-GRID_04-ROW_12-STR_08",
  latitude: "32.222780",
  longitude: "-110.974370",
  cadObjectId: null, erpAssetId: null, procoreLocationId: null,
  ...over,
});

describe("CR-17 canonical internalLabel", () => {
  it("accepts 4- and 5-segment canonical labels", () => {
    expect(isCanonicalLabel("APEX_SOLAR-GRID_04-ROW_12-STR_08")).toBe(true);
    expect(isCanonicalLabel("APEX_SOLAR-GRID_04-ROW_12-STR_08-MOD_14")).toBe(true);
  });
  it("rejects the legacy scheme and malformed labels", () => {
    expect(isCanonicalLabel("PV_ARRAY_04-ROW_12")).toBe(false); // too few segments
    expect(isCanonicalLabel("apex_solar-grid_04-row_12-str_08")).toBe(false); // lowercase
    expect(isCanonicalLabel("APEX SOLAR-GRID_04-ROW_12-STR_08")).toBe(false); // space
    expect(isCanonicalLabel("A-B-C-D-E-F")).toBe(false); // 6 segments
    expect(isCanonicalLabel("")).toBe(false);
  });
});

describe("coordinate validation (6-dp, in range)", () => {
  it("accepts valid 6-dp coords", () => {
    expect(validateCoordString("32.222780", "lat")).toEqual({ ok: true, value: 32.22278 });
    expect(validateCoordString("-110.974370", "lon")).toEqual({ ok: true, value: -110.97437 });
  });
  it("rejects out-of-range and over-precise values", () => {
    expect(validateCoordString("91.0", "lat").ok).toBe(false); // > 90
    expect(validateCoordString("-181.0", "lon").ok).toBe(false); // < -180
    expect(validateCoordString("32.1234567", "lat").ok).toBe(false); // 7 dp
    expect(validateCoordString("abc", "lat").ok).toBe(false);
  });
});

describe("validateAssetInput", () => {
  it("accepts a well-formed asset (with and without coords)", () => {
    expect(validateAssetInput(asset())).toEqual({ ok: true });
    expect(validateAssetInput(asset({ latitude: null, longitude: null })).ok).toBe(true);
  });
  it("requires a canonical label", () => {
    expect(validateAssetInput(asset({ internalLabel: "not-canonical" })).ok).toBe(false);
    expect(validateAssetInput(asset({ internalLabel: "" })).ok).toBe(false);
  });
  it("requires latitude and longitude together", () => {
    expect(validateAssetInput(asset({ longitude: null })).ok).toBe(false);
  });
  it("rejects a non-integer procoreLocationId", () => {
    expect(validateAssetInput(asset({ procoreLocationId: "12.5" })).ok).toBe(false);
    expect(validateAssetInput(asset({ procoreLocationId: "1024" })).ok).toBe(true);
  });
});

describe("parseAssetCsv", () => {
  it("parses header (with aliases) + rows and reports 1-based line numbers", () => {
    const csv = "label,lat,lng,procore_location_id\nAPEX_SOLAR-GRID_05-ROW_01-STR_01,32.23,-110.98,1024";
    const p = parseAssetCsv(csv);
    expect(p.ok).toBe(true);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].line).toBe(2);
    expect(p.rows[0].values.internalLabel).toBe("APEX_SOLAR-GRID_05-ROW_01-STR_01");
    expect(p.rows[0].values.latitude).toBe("32.23");
    expect(p.rows[0].values.longitude).toBe("-110.98");
    expect(p.rows[0].values.procoreLocationId).toBe("1024");
  });
  it("rejects a header missing a required column", () => {
    const p = parseAssetCsv("internalLabel,latitude\nA-B-C-D,1.0");
    expect(p.ok).toBe(false);
    expect(p.error).toMatch(/longitude/);
  });
  it("rejects empty input", () => {
    expect(parseAssetCsv("").ok).toBe(false);
  });
});
