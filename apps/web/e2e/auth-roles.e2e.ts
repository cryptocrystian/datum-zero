import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterAll } from "vitest";

// --- env: DATABASE_URL from repo .env locally (CI sets it as job env) ---
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL.
}

import type { Session } from "next-auth";
import { prisma } from "@dz/db";
import { conciergeAdapter, enrichSession } from "@/lib/auth-core";

/**
 * Regression guard for the PILOT sign-in bug (fix(auth): pilot role sign-in configuration error).
 *
 * Every seeded role must complete the magic-link sign-in lifecycle and reach a gated landing route.
 * This catches BOTH ways the pilot broke:
 *   1. a mis-seeded role (a stale Prisma client once seeded the pilot as REVIEWER via the default);
 *   2. deleteSession throwing on a missing session row (stale cookie / user switch) — the stock
 *      PrismaAdapter's session.delete() throws P2025, which surfaced as error=Configuration.
 */
const ROLES = [
  { email: "admin@lighthouse-solar.example", role: "ADMIN", landing: "(cockpit)/layout.tsx" },
  { email: "reviewer@lighthouse-solar.example", role: "REVIEWER", landing: "(cockpit)/layout.tsx" },
  { email: "pilot@lighthouse-solar.example", role: "PILOT", landing: "field/layout.tsx" },
] as const;

const adapter = conciergeAdapter();
const createdTokens: string[] = [];

afterAll(async () => {
  for (const t of createdTokens) {
    try {
      await adapter.deleteSession!(t);
    } catch {
      // best-effort cleanup
    }
  }
  await prisma.$disconnect();
});

describe("auth — every seeded role completes sign-in (pilot regression)", () => {
  for (const { email, role } of ROLES) {
    it(`${role} signs in end-to-end with the right tenant + role`, async () => {
      const user = await adapter.getUserByEmail!(email);
      expect(user, `${email} must be concierge-provisioned`).toBeTruthy();
      if (!user) return;

      // valid tenant + the INTENDED role (a stale-client seed would leave the wrong role here)
      expect(user.organizationId).toBeTruthy();
      expect(user.role).toBe(role);

      // magic-link session lifecycle via the adapter — exactly what Auth.js runs on callback
      const token = `authrole-${role}-${Date.now()}`;
      createdTokens.push(token);
      await adapter.createSession!({ sessionToken: token, userId: user.id, expires: new Date(Date.now() + 3_600_000) });
      const su = await adapter.getSessionAndUser!(token);
      expect(su?.user.id).toBe(user.id);

      // enrichment carries tenant + role onto the session (database strategy) for every role
      const enriched = enrichSession({ user: {} } as Session, su!.user);
      expect(enriched.user!.id).toBe(user.id);
      expect(enriched.user!.organizationId).toBe(user.organizationId);
      expect(enriched.user!.role).toBe(role);
    });
  }

  it("deleteSession on a missing token is a no-op — never error=Configuration", async () => {
    // The exact call Auth.js makes when a magic link switches users with a stale cookie present.
    // Must NOT throw (the stock PrismaAdapter .delete() throws P2025 → AdapterError → Configuration).
    await adapter.deleteSession!(`never-existed-${Date.now()}`);
  });

  it("every role's landing route is auth-gated", () => {
    for (const { landing } of ROLES) {
      const src = fs.readFileSync(path.join(repoRoot, "apps/web/app", landing), "utf8");
      expect(src.includes("getSession"), `${landing} must gate on a real session`).toBe(true);
      expect(src.includes("redirect("), `${landing} must redirect unauthenticated`).toBe(true);
    }
  });
});
