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
import { verifyPolicyManually, listPilotPolicies } from "@/lib/insurance/admin";

/**
 * M2-4a — concierge COI verification (CR-33, CR-08), the day-one path for setting isVerified. An admin
 * confirms an uploaded COI → isVerified + MANUAL_QA + coverage window. Org-scoped; verify only.
 */
const ORG = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-0000000000ff";
const createdPilots: string[] = [];
let seq = 0;

async function makePilotWithUnverifiedPolicy(): Promise<{ pilotId: string; policyId: string }> {
  seq += 1;
  const pilot = await prisma.pilot.create({
    data: {
      organizationId: ORG,
      firstName: "COI",
      lastName: `Pilot${seq}`,
      email: `coi-${seq}-${Date.now()}@datum-zero.example`,
      part107LicenseNum: `FA-COI-${seq}`,
      licenseExpiry: new Date("2028-01-01T00:00:00Z"),
    },
    select: { id: true },
  });
  createdPilots.push(pilot.id);
  const policy = await prisma.pilotInsurance.create({
    data: {
      pilotId: pilot.id,
      kind: "BYO_ANNUAL",
      providerName: "Test Aviation Underwriters",
      liabilityLimit: "5000000.00",
      isDedicatedAviation: true,
      hasBlanketAI: true,
      hasPrimaryNonContrib: true,
      hasWaiverOfSubrogation: true,
      isVerified: false, // starts unverified — the admin action flips it
    },
    select: { id: true },
  });
  return { pilotId: pilot.id, policyId: policy.id };
}

afterAll(async () => {
  await runWithOrg(ORG, async () => {
    await prisma.pilotInsurance.deleteMany({ where: { pilotId: { in: createdPilots } } });
    await prisma.pilot.deleteMany({ where: { id: { in: createdPilots } } });
  });
  await prisma.$disconnect();
});

describe("concierge COI verification (M2-4a, CR-33, CR-08)", () => {
  it("an admin verify sets isVerified + MANUAL_QA source + coverage window (org-scoped)", async () => {
    await runWithOrg(ORG, async () => {
      const { policyId } = await makePilotWithUnverifiedPolicy();
      const dto = await verifyPolicyManually(ORG, policyId, {
        coverageStart: new Date("2026-08-01T00:00:00Z"),
        coverageEnd: new Date("2026-08-31T00:00:00Z"),
      });
      expect(dto.isVerified).toBe(true);
      expect(dto.verificationSource).toBe("MANUAL_QA");
      expect(dto.verifiedAt).toBeTruthy();
      expect(dto.coverageStart).toBeTruthy();
      expect(dto.coverageEnd).toBeTruthy();
    });
  });

  it("rejects an incoherent window (end <= start)", async () => {
    await runWithOrg(ORG, async () => {
      const { policyId } = await makePilotWithUnverifiedPolicy();
      await expect(
        verifyPolicyManually(ORG, policyId, {
          coverageStart: new Date("2026-08-31T00:00:00Z"),
          coverageEnd: new Date("2026-08-01T00:00:00Z"),
        }),
      ).rejects.toThrow();
    });
  });

  it("tenant isolation: another org cannot verify this org's policy, and it stays unverified", async () => {
    let policyId = "";
    let pilotId = "";
    await runWithOrg(ORG, async () => {
      ({ policyId, pilotId } = await makePilotWithUnverifiedPolicy());
    });
    await runWithOrg(OTHER, async () => {
      await expect(
        verifyPolicyManually(OTHER, policyId, {
          coverageStart: new Date("2026-08-01T00:00:00Z"),
          coverageEnd: new Date("2026-08-31T00:00:00Z"),
        }),
      ).rejects.toThrow("policy not found in org");
    });
    await runWithOrg(ORG, async () => {
      const [p] = await listPilotPolicies(ORG, pilotId);
      expect(p.isVerified).toBe(false);
    });
  });
});
