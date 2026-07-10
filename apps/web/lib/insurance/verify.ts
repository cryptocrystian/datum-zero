/**
 * M2-4a — Coverage verification (CR-33, CR-02/CR-09/CR-10). PURE + deterministic: no I/O, no Prisma,
 * no clock — fully unit-testable and impossible to bypass. The mission gate (lib/missions/dispatch.ts)
 * projects the org-scoped PilotInsurance / ClientContract rows into these plain shapes and calls this.
 *
 * POSTURE (CR-03/10): we VERIFY proof of coverage against the client's requirement profile. We never
 * bind a policy, collect a premium, or resell insurance. This function only READS a policy + profile
 * and reports whether the policy is adequate — evidence, not verdict (CR-12).
 *
 * A coverage match is a PROFILE match, not a single number (CR-02): the per-client requirement profile
 * — required limit + the dedicated-aviation / additional-insured / primary-non-contributory /
 * waiver-of-subrogation riders (CR-09) — must ALL hold, the policy must be verified, and its coverage
 * window must fully contain the mission window. FAIL CLOSED: any missing or negative dimension fails,
 * and an absent coverage window is a failure (never assumed).
 */

/** Policy shape (a projection of PilotInsurance; Decimal → number so this stays Prisma/Decimal-free). */
export interface CoveragePolicy {
  liabilityLimit: number;
  isDedicatedAviation: boolean;
  hasBlanketAI: boolean;
  hasPrimaryNonContrib: boolean;
  hasWaiverOfSubrogation: boolean;
  isVerified: boolean;
  coverageStart: Date | null;
  coverageEnd: Date | null;
}

/** Requirement profile (a projection of ClientContract; the per-client required dimensions, CR-02). */
export interface CoverageProfile {
  requiredLiabilityLimit: number;
  requiresDedicatedAviation: boolean;
  requiresAdditionalInsured: boolean;
  requiresPrimaryNonContrib: boolean;
  requiresWaiverOfSubrogation: boolean;
}

/** The mission window the coverage must fully contain (inclusive on both ends). */
export interface MissionWindow {
  start: Date;
  end: Date;
}

export interface CoverageResult {
  ok: boolean;
  /** Evidence-framed reasons, one per failed dimension (empty when ok). Never verdict language (CR-12). */
  failures: string[];
}

/** Deterministic USD formatting (no Intl/ICU dependency): 5000000 -> "$5,000,000". */
function usd(n: number): string {
  return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/**
 * Verify a policy against a client requirement profile for a mission window. Passes ONLY if every
 * required dimension holds. Pure — safe to unit-test exhaustively.
 */
export function verifyCoverage(
  policy: CoveragePolicy,
  profile: CoverageProfile,
  window: MissionWindow,
): CoverageResult {
  const failures: string[] = [];

  // (1) Liability limit meets the per-client required limit (CR-02 — the profile, never a hardcoded number).
  if (!(policy.liabilityLimit >= profile.requiredLiabilityLimit)) {
    failures.push(
      `liability limit ${usd(policy.liabilityLimit)} below required ${usd(profile.requiredLiabilityLimit)}`,
    );
  }

  // (2) Dedicated aviation — a CGL rider is NOT sufficient (CR-09).
  if (profile.requiresDedicatedAviation && !policy.isDedicatedAviation) {
    failures.push("policy is not dedicated-aviation (a CGL rider does not satisfy the requirement)");
  }

  // (3) Client named as additional-insured (blanket AI endorsement, CR-09).
  if (profile.requiresAdditionalInsured && !policy.hasBlanketAI) {
    failures.push("policy does not name the client as additional-insured");
  }

  // (4) Primary & non-contributory.
  if (profile.requiresPrimaryNonContrib && !policy.hasPrimaryNonContrib) {
    failures.push("policy is not primary & non-contributory");
  }

  // (5) Waiver of subrogation. NOTE (see CR-33): the schema models this requirement + endorsement, so
  // the fail-closed match includes it even though the M2-4a ticket enumerated only the first three
  // riders — leaving a modeled, default-required dimension unchecked would be fail-open.
  if (profile.requiresWaiverOfSubrogation && !policy.hasWaiverOfSubrogation) {
    failures.push("policy has no waiver of subrogation");
  }

  // (6) Verified AND the coverage window fully contains the mission window (CR-10 — fail closed).
  if (!policy.isVerified) {
    failures.push("policy is not verified");
  }
  if (policy.coverageStart == null || policy.coverageEnd == null) {
    failures.push("policy has no confirmed coverage window");
  } else {
    if (policy.coverageStart.getTime() > window.start.getTime()) {
      failures.push("coverage begins after the mission start");
    }
    if (window.end.getTime() > policy.coverageEnd.getTime()) {
      failures.push("coverage ends before the mission end");
    }
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Evaluate a pilot's set of policies against one requirement profile + mission window. Coverage holds
 * if ANY single policy is adequate (a pilot may carry more than one — e.g. a BYO annual plus an
 * on-demand rider). When none pass, the CLOSEST candidate's reasons (fewest failed dimensions) are
 * surfaced so the operator sees the most-actionable gap. Pure — the mission gate projects the rows.
 */
export function evaluateCoverage(
  policies: CoveragePolicy[],
  profile: CoverageProfile,
  window: MissionWindow,
): CoverageResult {
  if (policies.length === 0) {
    return { ok: false, failures: ["no insurance policy on file for the pilot"] };
  }
  const results = policies.map((p) => verifyCoverage(p, profile, window));
  if (results.some((r) => r.ok)) return { ok: true, failures: [] };
  const best = results.reduce((a, b) => (b.failures.length < a.failures.length ? b : a));
  return { ok: false, failures: best.failures };
}
