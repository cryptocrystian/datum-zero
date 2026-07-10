import { describe, it, expect } from "vitest";
import { validateManualVerify } from "./admin";

describe("validateManualVerify (M2-4a/CR-08) — the COI must state a coherent coverage window", () => {
  it("accepts a valid start < end window", () => {
    const r = validateManualVerify({
      coverageStart: new Date("2026-08-01T00:00:00Z"),
      coverageEnd: new Date("2026-08-31T00:00:00Z"),
    });
    expect(r).toEqual({ ok: true });
  });

  it("rejects an end at or before the start", () => {
    const r = validateManualVerify({
      coverageStart: new Date("2026-08-31T00:00:00Z"),
      coverageEnd: new Date("2026-08-01T00:00:00Z"),
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an equal start and end (zero-length window)", () => {
    const d = new Date("2026-08-15T00:00:00Z");
    expect(validateManualVerify({ coverageStart: d, coverageEnd: d }).ok).toBe(false);
  });

  it("rejects an invalid date", () => {
    const r = validateManualVerify({
      coverageStart: new Date("not-a-date"),
      coverageEnd: new Date("2026-08-31T00:00:00Z"),
    });
    expect(r.ok).toBe(false);
  });
});
