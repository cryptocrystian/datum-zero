import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterAll, beforeAll } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL.
}

import { prisma, runWithOrg } from "@dz/db";
import { dispatchMission } from "@/lib/missions/dispatch";
import { CoverageGateError } from "@/lib/insurance/coverage-gate";

/**
 * M2-4a — the fail-closed coverage gate, exercised end-to-end against the seeded org's $5M
 * ClientContract profile (CR-02/09). Each scenario builds a fresh org-owned pilot so policies never
 * bleed across cases. The gate is server-enforced: an inadequate/unverified mission is REFUSED.
 */
const ORG = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-0000000000ff";
const SCHEDULED = new Date("2026-08-15T00:00:00Z");

let contractId: string;
const createdPilots: string[] = [];
const createdMissions: string[] = [];
let seq = 0;

type PolicyOver = Partial<{
  liabilityLimit: string;
  isDedicatedAviation: boolean;
  hasBlanketAI: boolean;
  hasPrimaryNonContrib: boolean;
  hasWaiverOfSubrogation: boolean;
  isVerified: boolean;
  coverageStart: Date;
  coverageEnd: Date;
}>;

/** Build a fresh org-owned pilot (+ optional policy) and a mission for it. Returns the mission id. */
async function setup(opts: { policy?: PolicyOver; withPolicy?: boolean; withContract?: boolean } = {}): Promise<string> {
  seq += 1;
  const pilot = await prisma.pilot.create({
    data: {
      organizationId: ORG,
      firstName: "Cov",
      lastName: `Test${seq}`,
      email: `cov-${seq}-${Date.now()}@datum-zero.example`,
      part107LicenseNum: `FA-COV-${seq}`,
      licenseExpiry: new Date("2028-01-01T00:00:00Z"),
    },
    select: { id: true },
  });
  createdPilots.push(pilot.id);

  if (opts.withPolicy !== false) {
    await prisma.pilotInsurance.create({
      data: {
        pilotId: pilot.id,
        kind: "BYO_ANNUAL",
        providerName: "Test Aviation Underwriters",
        liabilityLimit: "5000000.00",
        isDedicatedAviation: true,
        hasBlanketAI: true,
        hasPrimaryNonContrib: true,
        hasWaiverOfSubrogation: true,
        isVerified: true,
        verificationSource: "MANUAL_QA",
        verifiedAt: new Date("2026-07-20T00:00:00Z"),
        coverageStart: new Date("2026-08-01T00:00:00Z"),
        coverageEnd: new Date("2026-08-31T00:00:00Z"),
        ...(opts.policy ?? {}),
      },
    });
  }

  const mission = await prisma.missionAssignment.create({
    data: {
      organizationId: ORG,
      clientContractId: opts.withContract === false ? null : contractId,
      pilotId: pilot.id,
      siteAddress: "APEX_SOLAR — GRID_04",
      targetCoordinates: "{}",
      payoutAmount: "1200.00",
      scheduledDate: SCHEDULED,
    },
    select: { id: true },
  });
  createdMissions.push(mission.id);
  return mission.id;
}

async function readCoverage(missionId: string): Promise<boolean> {
  const m = await prisma.missionAssignment.findFirst({ where: { id: missionId }, select: { coverageVerified: true } });
  return m!.coverageVerified;
}

beforeAll(async () => {
  await runWithOrg(ORG, async () => {
    const c = await prisma.clientContract.findFirst({ where: { organizationId: ORG }, select: { id: true } });
    if (!c) throw new Error("seed ClientContract missing — run the db seed");
    contractId = c.id;
  });
});

afterAll(async () => {
  await runWithOrg(ORG, async () => {
    await prisma.missionAssignment.deleteMany({ where: { id: { in: createdMissions } } });
    await prisma.pilotInsurance.deleteMany({ where: { pilotId: { in: createdPilots } } });
    await prisma.pilot.deleteMany({ where: { id: { in: createdPilots } } });
  });
  await prisma.$disconnect();
});

describe("dispatchMission — fail-closed coverage gate (M2-4a, CR-33, CR-10)", () => {
  it("adequate + verified policy → mission dispatches, coverageVerified persisted true", async () => {
    await runWithOrg(ORG, async () => {
      const missionId = await setup();
      const r = await dispatchMission(missionId, ORG);
      expect(r.coverageVerified).toBe(true);
      expect(await readCoverage(missionId)).toBe(true);
    });
  });

  it("unverified policy → dispatch REFUSED at the service layer, coverageVerified false", async () => {
    await runWithOrg(ORG, async () => {
      const missionId = await setup({ policy: { isVerified: false } });
      await expect(dispatchMission(missionId, ORG)).rejects.toBeInstanceOf(CoverageGateError);
      expect(await readCoverage(missionId)).toBe(false);
    });
  });

  it("inadequate limit ($1M < required $5M) → dispatch REFUSED with the specific reason", async () => {
    await runWithOrg(ORG, async () => {
      const missionId = await setup({ policy: { liabilityLimit: "1000000.00" } });
      await expect(dispatchMission(missionId, ORG)).rejects.toMatchObject({
        failures: expect.arrayContaining([expect.stringMatching(/liability limit/)]),
      });
      expect(await readCoverage(missionId)).toBe(false);
    });
  });

  it("coverage window not covering the mission → dispatch REFUSED", async () => {
    await runWithOrg(ORG, async () => {
      const missionId = await setup({ policy: { coverageEnd: new Date("2026-08-10T00:00:00Z") } });
      await expect(dispatchMission(missionId, ORG)).rejects.toBeInstanceOf(CoverageGateError);
    });
  });

  it("no policy on file → dispatch REFUSED (fail closed)", async () => {
    await runWithOrg(ORG, async () => {
      const missionId = await setup({ withPolicy: false });
      await expect(dispatchMission(missionId, ORG)).rejects.toBeInstanceOf(CoverageGateError);
    });
  });

  it("no client requirement profile → dispatch REFUSED (cannot verify)", async () => {
    await runWithOrg(ORG, async () => {
      const missionId = await setup({ withContract: false });
      await expect(dispatchMission(missionId, ORG)).rejects.toMatchObject({
        failures: expect.arrayContaining([expect.stringMatching(/requirement profile/)]),
      });
    });
  });

  it("tenant isolation: another org cannot dispatch this org's mission", async () => {
    let missionId = "";
    await runWithOrg(ORG, async () => {
      missionId = await setup();
    });
    await runWithOrg(OTHER, async () => {
      await expect(dispatchMission(missionId, OTHER)).rejects.toBeInstanceOf(CoverageGateError);
    });
  });
});
