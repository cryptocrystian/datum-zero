import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { conciergeAdapter, enrichSession, isEligibleForSignIn } from "@/lib/auth-core";
import { getEmailPort } from "@/lib/email";

/**
 * M1-01 — real authentication (CR-20). Auth.js v5, email magic-link (no passwords), database
 * sessions in Postgres. Users are CONCIERGE-PROVISIONED (CR-14): no self-serve signup — the adapter
 * refuses to create users, and sign-in is denied for any email not seeded. The session carries
 * { userId, organizationId, role }. Keep this file the ONLY place the provider is configured so it
 * can be swapped later (the app consumes it through lib/session.ts). Adapter + session enrichment
 * live in lib/auth-core.ts so they stay testable across every role (see e2e/auth-roles.e2e.ts).
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: conciergeAdapter(),
  session: { strategy: "database" },
  trustHost: true,
  pages: { signIn: "/signin", verifyRequest: "/signin?sent=1", error: "/signin?error=1" },
  providers: [
    Nodemailer({
      server: { host: "localhost", port: 587 }, // unused — delivery goes through the EmailPort seam
      from: process.env.EMAIL_FROM ?? "no-reply@datumzero.local",
      async sendVerificationRequest({ identifier, url, expires }) {
        // Delivery is behind the EmailPort seam (M2-5a, CR-34): the dev stub (console + temp file) in
        // dev, AWS SES in prod, selected by env with credentials from the vault. The magic-link URL is
        // never logged here. Fail-closed alert wrapping is added in commit 2.
        await getEmailPort().sendMagicLink({ to: identifier, url, expiresAt: expires });
      },
    }),
  ],
  callbacks: {
    // Deny sign-in for any email not concierge-provisioned OR deactivated (OPS-4, CR-14).
    async signIn({ user }) {
      return isEligibleForSignIn(user?.email);
    },
    // Enrich the session with tenant + role (database strategy passes the DB user).
    session({ session, user }) {
      return enrichSession(session, user);
    },
  },
});
