import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { conciergeAdapter, enrichSession, isEligibleForSignIn } from "@/lib/auth-core";

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
      server: { host: "localhost", port: 587 }, // unused in dev — the link is logged, not emailed
      from: process.env.EMAIL_FROM ?? "no-reply@datumzero.local",
      async sendVerificationRequest({ identifier, url }) {
        // Dev: no SMTP. Surface the magic link two ways so it's easy to find — a prominent server
        // log AND a temp file that /signin reads to show a one-click link. Prod: swap for real delivery.
        const rule = "═".repeat(72);
        // eslint-disable-next-line no-console
        console.log(`\n${rule}\n🔗 [auth] DEV magic sign-in link for ${identifier}:\n${url}\n${rule}\n`);
        if (process.env.NODE_ENV !== "production") {
          try {
            const [{ writeFile }, os, path] = await Promise.all([
              import("node:fs/promises"),
              import("node:os"),
              import("node:path"),
            ]);
            await writeFile(
              path.join(os.tmpdir(), "dz-magic-link.json"),
              JSON.stringify({ identifier, url, at: Date.now() }),
              "utf8",
            );
          } catch {
            // best-effort dev convenience; the server log above is always the fallback
          }
        }
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
