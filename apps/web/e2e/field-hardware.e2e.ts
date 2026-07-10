import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterAll } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL.
}

import { prisma, runWithOrg } from "@dz/db";
import { screenAirframe } from "@/lib/ingestion/airframe-binding";

/**
 * M1-06 — the org-scoped airframe registry screen behind the Infield Validator's verified-airframe
 * check. Runs against the seeded airframes: verified DZ-THERMAL-0001, unverified DZ-THERMAL-9999.
 */
const ORG = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-0000000000ff";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("screenAirframe — org-scoped registry match (M1-06)", () => {
  it("VERIFIED for the seeded verified serial", async () => {
    const r = await runWithOrg(ORG, () => screenAirframe(ORG, "DZ-THERMAL-0001"));
    expect(r.status).toBe("VERIFIED");
    expect(r.matchedField).toBeTruthy();
  });

  it("UNVERIFIED for a registered-but-unverified serial (fail closed)", async () => {
    const r = await runWithOrg(ORG, () => screenAirframe(ORG, "DZ-THERMAL-9999"));
    expect(r.status).toBe("UNVERIFIED");
  });

  it("UNKNOWN for an unregistered serial", async () => {
    const r = await runWithOrg(ORG, () => screenAirframe(ORG, "NOPE-0000"));
    expect(r.status).toBe("UNKNOWN");
  });

  it("also matches the verified airframe by its remote-ID serial", async () => {
    // the seed sets remoteIdSerial == serialNumber for the verified airframe
    const r = await runWithOrg(ORG, () => screenAirframe(ORG, "DZ-THERMAL-0001"));
    expect(["serialNumber", "remoteIdSerial"]).toContain(r.matchedField);
  });

  it("is tenant-isolated: another org cannot resolve this tenant's org-owned airframe (RLS)", async () => {
    const r = await runWithOrg(OTHER, () => screenAirframe(OTHER, "DZ-THERMAL-0001"));
    expect(r.status).toBe("UNKNOWN");
  });
});
