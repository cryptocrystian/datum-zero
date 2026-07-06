/**
 * Stubbed authenticated identity for M0 (CR-06 cockpit).
 *
 * Real auth (session + org membership + Postgres RLS) is post-M0. Until then the cockpit operates
 * as the seeded concierge tenant with a fixed QA reviewer. The identity is STUBBED, but every
 * server action still records WHO reviewed — the 100% QA gate is real (CR-12).
 */
export const STUB_ORG_ID = "00000000-0000-0000-0000-000000000001";

export function getCurrentOrgId(): string {
  return STUB_ORG_ID;
}

export function getCurrentReviewer(): { id: string; name: string } {
  return { id: "stub-qa-reviewer", name: "QA Reviewer (stub)" };
}
