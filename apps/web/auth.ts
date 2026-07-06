import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@dz/db";

/**
 * M1-01 — real authentication (CR-20). Auth.js v5, email magic-link (no passwords), database
 * sessions in Postgres. Users are CONCIERGE-PROVISIONED (CR-14): no self-serve signup — the adapter
 * refuses to create users, and sign-in is denied for any email not seeded. The session carries
 * { userId, organizationId, role }. Keep this file the ONLY place the provider is configured so it
 * can be swapped later (the app consumes it through lib/session.ts).
 */

// Concierge-only adapter: never auto-create a user (@auth/core pinned to one version — no skew).
const adapter: Adapter = {
  ...PrismaAdapter(prisma),
  createUser() {
    throw new Error("No self-serve signup — users are concierge-provisioned (CR-14).");
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "database" },
  trustHost: true,
  pages: { signIn: "/signin", verifyRequest: "/signin?sent=1", error: "/signin?error=1" },
  providers: [
    Nodemailer({
      server: { host: "localhost", port: 587 }, // unused in dev — the link is logged, not emailed
      from: process.env.EMAIL_FROM ?? "no-reply@datumzero.local",
      async sendVerificationRequest({ identifier, url }) {
        // Dev: no SMTP. Log the magic link so you can sign in. Prod: swap for real delivery.
        // eslint-disable-next-line no-console
        console.log(`\n🔗 [auth] magic sign-in link for ${identifier}:\n${url}\n`);
      },
    }),
  ],
  callbacks: {
    // Defense-in-depth: deny sign-in for any email not provisioned by the concierge seed.
    async signIn({ user }) {
      if (!user?.email) return false;
      const exists = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
      return Boolean(exists);
    },
    // Enrich the session with tenant + role (database strategy passes the DB user).
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.organizationId = user.organizationId;
        session.user.role = user.role;
      }
      return session;
    },
  },
});
