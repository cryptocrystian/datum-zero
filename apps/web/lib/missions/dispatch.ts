import { prisma, MissionStatus } from "@dz/db";
import {
  evaluateCoverage,
  type CoveragePolicy,
  type CoverageProfile,
  type CoverageResult,
  type MissionWindow,
} from "../insurance/verify";
import { assertCoverageVerifiedForDispatch, CoverageGateError } from "../insurance/coverage-gate";

/**
 * M2-4a — the SINGLE server-side mission dispatch/activation entry point (CR-33, CR-10). It computes
 * coverageVerified from the pilot's org-scoped policies against the mission's ClientContract profile +
 * window, PERSISTS the outcome, and FAILS CLOSED: the mission is not activated unless a
 * verified-and-adequate policy covers the window. Mirrors the QA-gate/dispatch pattern (lib/outbox).
 *
 * We VERIFY only — this path never binds a policy, collects a premium, or resells insurance (CR-03).
 * Every query is organizationId-scoped (the pilot's policies resolve via the org-or-marketplace pool,
 * exactly like the airframe registry, CR-11); RLS backstops the app-layer filter.
 */

// --- Prisma-row → pure-shape projections (Decimal → number) so verifyCoverage stays I/O-free. ---
type InsuranceRow = {
  liabilityLimit: unknown;
  isDedicatedAviation: boolean;
  hasBlanketAI: boolean;
  hasPrimaryNonContrib: boolean;
  hasWaiverOfSubrogation: boolean;
  isVerified: boolean;
  coverageStart: Date | null;
  coverageEnd: Date | null;
};
type ContractRow = {
  requiredLiabilityLimit: unknown;
  requiresDedicatedAviation: boolean;
  requiresAdditionalInsured: boolean;
  requiresPrimaryNonContrib: boolean;
  requiresWaiverOfSubrogation: boolean;
};

function toPolicy(i: InsuranceRow): CoveragePolicy {
  return {
    liabilityLimit: Number(i.liabilityLimit),
    isDedicatedAviation: i.isDedicatedAviation,
    hasBlanketAI: i.hasBlanketAI,
    hasPrimaryNonContrib: i.hasPrimaryNonContrib,
    hasWaiverOfSubrogation: i.hasWaiverOfSubrogation,
    isVerified: i.isVerified,
    coverageStart: i.coverageStart,
    coverageEnd: i.coverageEnd,
  };
}

function toProfile(c: ContractRow): CoverageProfile {
  return {
    requiredLiabilityLimit: Number(c.requiredLiabilityLimit),
    requiresDedicatedAviation: c.requiresDedicatedAviation,
    requiresAdditionalInsured: c.requiresAdditionalInsured,
    requiresPrimaryNonContrib: c.requiresPrimaryNonContrib,
    requiresWaiverOfSubrogation: c.requiresWaiverOfSubrogation,
  };
}

export interface MissionDispatchResult {
  missionId: string;
  coverageVerified: boolean;
  failures: string[];
  status: MissionStatus;
}

export async function dispatchMission(
  missionId: string,
  organizationId: string,
): Promise<MissionDispatchResult> {
  const mission = await prisma.missionAssignment.findFirst({
    where: { id: missionId, organizationId },
    select: {
      id: true,
      status: true,
      scheduledDate: true,
      clientContract: {
        select: {
          requiredLiabilityLimit: true,
          requiresDedicatedAviation: true,
          requiresAdditionalInsured: true,
          requiresPrimaryNonContrib: true,
          requiresWaiverOfSubrogation: true,
        },
      },
      pilot: {
        select: {
          insurance: {
            select: {
              liabilityLimit: true,
              isDedicatedAviation: true,
              hasBlanketAI: true,
              hasPrimaryNonContrib: true,
              hasWaiverOfSubrogation: true,
              isVerified: true,
              coverageStart: true,
              coverageEnd: true,
            },
          },
        },
      },
    },
  });
  if (!mission) {
    throw new CoverageGateError("Coverage gate: mission not found in org; dispatch refused.");
  }
  if (mission.status === MissionStatus.CANCELLED) {
    throw new CoverageGateError("Coverage gate: mission is cancelled; dispatch refused.");
  }

  // Mission window: MissionAssignment models a single scheduledDate with no explicit end, so the flight
  // is treated as same-day (start = end = scheduledDate). A multi-day duration is a later schema add
  // (flagged in CR-33) — verifyCoverage already takes an explicit {start,end}, so widening is caller-only.
  const window: MissionWindow = { start: mission.scheduledDate, end: mission.scheduledDate };

  // No client requirement profile → we cannot verify coverage → fail closed (CR-10).
  const result: CoverageResult = mission.clientContract
    ? evaluateCoverage(mission.pilot.insurance.map(toPolicy), toProfile(mission.clientContract), window)
    : { ok: false, failures: ["mission has no client requirement profile; coverage cannot be verified"] };

  // Record a FAILED outcome on the mission (org-scoped) so the operator sees coverageVerified=false +
  // the failed dimensions. This is NOT a dispatch — it records the refusal before the gate throws.
  if (!result.ok) {
    await prisma.missionAssignment.updateMany({
      where: { id: missionId, organizationId },
      data: { coverageVerified: false },
    });
  }

  // Server-enforced fail-closed gate — an unverified/inadequate mission NEVER proceeds past this line.
  assertCoverageVerifiedForDispatch({ coverageVerified: result.ok, failures: result.failures });

  // Cleared to fly: mark the mission coverage-verified + active. This is the guarded dispatch write and
  // is only reached PAST the gate (verified-and-adequate). No other code path may set coverageVerified.
  await prisma.missionAssignment.updateMany({
    where: { id: missionId, organizationId },
    data: { coverageVerified: true, status: MissionStatus.ASSIGNED },
  });

  return { missionId, coverageVerified: true, failures: [], status: MissionStatus.ASSIGNED };
}
