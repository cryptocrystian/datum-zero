import type { Adapter, AdapterUser } from "next-auth/adapters";
import type { Session } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@dz/db";

/**
 * Concierge auth core (CR-14/CR-20), extracted so it can be tested WITHOUT booting NextAuth.
 *
 * Two hardening rules live here:
 *  - never auto-create a user (concierge-only provisioning);
 *  - deleting a missing session is a NO-OP. Auth.js's email flow calls deleteSession(sessionToken)
 *    when a magic link switches users; the stock PrismaAdapter uses `session.delete()`, which throws
 *    P2025 if the cookie points at an already-gone row (stale cookie, or a dev DB reset). That
 *    AdapterError surfaces to the user as `error=Configuration` and blocks sign-in. deleteMany()
 *    removes 0-or-1 rows without throwing, so a second/stale sign-in always succeeds.
 */
export function conciergeAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    createUser() {
      throw new Error("No self-serve signup — users are concierge-provisioned (CR-14).");
    },
    async deleteSession(sessionToken: string) {
      await prisma.session.deleteMany({ where: { sessionToken } });
      return null;
    },
  };
}

/**
 * Sign-in eligibility (CR-14/CR-20, OPS-4). A magic-link sign-in is allowed ONLY for an email that is
 * concierge-provisioned AND active. Deactivating a user (OPS-4) flips `isActive` false and this denies
 * their next sign-in — no self-serve signup, no reactivation except by an ADMIN. Extracted so it is
 * testable without booting NextAuth (the signIn callback delegates here).
 */
export async function isEligibleForSignIn(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const u = await prisma.user.findUnique({ where: { email }, select: { isActive: true } });
  return Boolean(u && u.isActive);
}

/**
 * Copy the DB user's tenant + role onto the session (database strategy). Role-agnostic: every
 * provisioned role (ADMIN, REVIEWER, PILOT) enriches identically — no role can special-case its way
 * into breaking sign-in.
 */
export function enrichSession(session: Session, user: AdapterUser): Session {
  if (session.user) {
    session.user.id = user.id;
    session.user.organizationId = user.organizationId;
    session.user.role = user.role;
  }
  return session;
}

/**
 * Map an Auth.js sign-in error to a redirect target WITHOUT leaking account existence (M2-5a, CR-34).
 * `AccessDenied` means the email is not concierge-provisioned/active — it MUST look identical to a
 * successful send ("check your email"), or /signin becomes an enumeration oracle. Every other error is
 * a genuine fault → a generic, non-revealing retry message. Pure — testable without booting NextAuth.
 */
export function signInErrorRedirect(errorType: string | undefined): string {
  if (errorType === "AccessDenied") return "/signin?sent=1";
  return "/signin?error=auth";
}
