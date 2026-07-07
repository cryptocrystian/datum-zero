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
