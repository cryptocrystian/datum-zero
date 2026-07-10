/**
 * M2-4a — the fail-closed COVERAGE gate on mission dispatch (CR-33, CR-10). Mirrors the 100% QA gate
 * (lib/outbox/gate.ts): PURE and throwing, so it is unit-testable and cannot be bypassed. A mission may
 * NOT be dispatched/activated unless a verified-and-adequate policy covers its window — enforced at the
 * service layer, never a UI-only check.
 *
 * Evidence, not verdict (CR-12): the specific failed dimensions ride along on the error so the operator
 * sees WHICH requirement was unmet. This module only reads a boolean + reasons and throws — it never
 * binds, collects, or resells insurance (CR-03).
 */
export class CoverageGateError extends Error {
  /** The specific unmet requirement dimensions (evidence-framed), for operator surfacing. */
  readonly failures: string[];
  constructor(message: string, failures: string[] = []) {
    super(message);
    this.name = "CoverageGateError";
    this.failures = failures;
  }
}

export interface CoverageGateInput {
  coverageVerified: boolean;
  failures?: string[];
}

/** Fail closed: throws unless the mission is coverage-verified for its window. Pure — read + throw. */
export function assertCoverageVerifiedForDispatch(m: CoverageGateInput): void {
  if (!m.coverageVerified) {
    const detail = m.failures && m.failures.length > 0 ? ` — ${m.failures.join("; ")}` : "";
    throw new CoverageGateError(
      `Coverage gate: mission has no verified-and-adequate policy for its window; dispatch refused (CR-10)${detail}.`,
      m.failures ?? [],
    );
  }
}
