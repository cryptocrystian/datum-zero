import { prisma, VerificationSource } from "@dz/db";

/**
 * M2-4a — concierge COI verification (CR-33, CR-08). The DAY-ONE way PilotInsurance.isVerified gets
 * set: an ADMIN reviews an uploaded certificate of insurance (COI) and marks the policy verified —
 * isVerified=true, verificationSource=MANUAL_QA, coverageStart/End from the COI.
 *
 * POSTURE (CR-03/10): we VERIFY proof of coverage; we NEVER bind a policy, collect a premium, or
 * resell insurance. This module only READS a policy and RECORDS a human confirmation — no payment,
 * no binding. "Verified" means "we confirmed the policy is real + active for this window"; whether it
 * is ADEQUATE for a given client is a separate profile match at dispatch (verifyCoverage). Automated
 * sources (PROVIDER_API referral, COI_VENDOR extraction) are M2-4b — demand-driven.
 *
 * Org-scoped like the airframe registry (CR-11): a policy is verifiable only when its pilot belongs to
 * the acting admin's org (or the shared marketplace pool). PilotInsurance has NO organizationId, so we
 * scope through the pilot relation and use findMany / updateMany (which accept a non-unique relation
 * filter) — NEVER findUnique / update, which would bypass the org scope. RLS backstops.
 */

const pilotScope = (organizationId: string) => ({
  OR: [{ organizationId }, { organizationId: null }],
});

export interface PolicyDTO {
  id: string;
  pilotId: string;
  kind: string;
  providerName: string;
  liabilityLimit: number;
  isDedicatedAviation: boolean;
  hasBlanketAI: boolean;
  hasPrimaryNonContrib: boolean;
  hasWaiverOfSubrogation: boolean;
  isVerified: boolean;
  verificationSource: string | null;
  verifiedAt: string | null;
  coverageStart: string | null;
  coverageEnd: string | null;
}

const SELECT = {
  id: true,
  pilotId: true,
  kind: true,
  providerName: true,
  liabilityLimit: true,
  isDedicatedAviation: true,
  hasBlanketAI: true,
  hasPrimaryNonContrib: true,
  hasWaiverOfSubrogation: true,
  isVerified: true,
  verificationSource: true,
  verifiedAt: true,
  coverageStart: true,
  coverageEnd: true,
} as const;

type Row = {
  id: string;
  pilotId: string;
  kind: string;
  providerName: string;
  liabilityLimit: unknown;
  isDedicatedAviation: boolean;
  hasBlanketAI: boolean;
  hasPrimaryNonContrib: boolean;
  hasWaiverOfSubrogation: boolean;
  isVerified: boolean;
  verificationSource: string | null;
  verifiedAt: Date | null;
  coverageStart: Date | null;
  coverageEnd: Date | null;
};

const toDTO = (p: Row): PolicyDTO => ({
  id: p.id,
  pilotId: p.pilotId,
  kind: p.kind,
  providerName: p.providerName,
  liabilityLimit: Number(p.liabilityLimit),
  isDedicatedAviation: p.isDedicatedAviation,
  hasBlanketAI: p.hasBlanketAI,
  hasPrimaryNonContrib: p.hasPrimaryNonContrib,
  hasWaiverOfSubrogation: p.hasWaiverOfSubrogation,
  isVerified: p.isVerified,
  verificationSource: p.verificationSource,
  verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
  coverageStart: p.coverageStart ? p.coverageStart.toISOString() : null,
  coverageEnd: p.coverageEnd ? p.coverageEnd.toISOString() : null,
});

export interface ManualVerifyInput {
  coverageStart: Date;
  coverageEnd: Date;
}

export type Validation = { ok: true } | { ok: false; error: string };

/** The COI must state a coherent coverage window. Pure — separately unit-testable. */
export function validateManualVerify(input: ManualVerifyInput): Validation {
  const s = input.coverageStart;
  const e = input.coverageEnd;
  if (!(s instanceof Date) || Number.isNaN(s.getTime())) return { ok: false, error: "coverage start is required" };
  if (!(e instanceof Date) || Number.isNaN(e.getTime())) return { ok: false, error: "coverage end is required" };
  if (e.getTime() <= s.getTime()) return { ok: false, error: "coverage end must be after coverage start" };
  return { ok: true };
}

/** Read a pilot's policies (org-scoped via the pilot: org-owned or the marketplace pool). */
export async function listPilotPolicies(organizationId: string, pilotId: string): Promise<PolicyDTO[]> {
  const rows = await prisma.pilotInsurance.findMany({
    where: { pilotId, pilot: pilotScope(organizationId) },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return rows.map(toDTO);
}

/**
 * Concierge verify (CR-08): an admin confirms an uploaded COI and marks the policy verified — sets
 * isVerified + MANUAL_QA source + the coverage window from the COI. Org-scoped; verify only, never
 * binds or collects (CR-03). Fails if the policy is not a pilot in the acting admin's org/pool.
 */
export async function verifyPolicyManually(
  organizationId: string,
  policyId: string,
  input: ManualVerifyInput,
): Promise<PolicyDTO> {
  const v = validateManualVerify(input);
  if (!v.ok) throw new Error(v.error);

  const res = await prisma.pilotInsurance.updateMany({
    where: { id: policyId, pilot: pilotScope(organizationId) },
    data: {
      isVerified: true,
      verificationSource: VerificationSource.MANUAL_QA,
      verifiedAt: new Date(),
      coverageStart: input.coverageStart,
      coverageEnd: input.coverageEnd,
    },
  });
  if (res.count !== 1) throw new Error("policy not found in org");

  const updated = await prisma.pilotInsurance.findFirst({
    where: { id: policyId, pilot: pilotScope(organizationId) },
    select: SELECT,
  });
  return toDTO(updated!);
}
