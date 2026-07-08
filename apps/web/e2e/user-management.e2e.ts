import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL.
}

import type { Session } from "next-auth";
import { prisma, runWithOrg } from "@dz/db";
import { createUser, listUsers, updateUser, deleteUser } from "@/lib/users/admin";
import { conciergeAdapter, enrichSession, isEligibleForSignIn } from "@/lib/auth-core";

const ORG_A = "00000000-0000-0000-0000-000000000001"; // seeded tenant
const ORG_B = "00000000-0000-0000-00b0-000000000001"; // e2e second tenant
const REV_EMAIL = "ops4.reviewer@e2e.example";
const ORGB_ADMIN_EMAIL = "ops4.orgb-admin@e2e.example";
const adapter = conciergeAdapter();
const tokens: string[] = [];

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { in: [REV_EMAIL, ORGB_ADMIN_EMAIL] } } }); // User is RLS-exempt
  await runWithOrg(ORG_B, async () => { await prisma.organization.deleteMany({ where: { id: ORG_B } }); });
}

beforeAll(cleanup);
afterAll(async () => {
  for (const t of tokens) { try { await adapter.deleteSession!(t); } catch { /* best effort */ } }
  await cleanup();
  await prisma.$disconnect();
});

describe("OPS-4 — admin user management (concierge, RLS-exempt app-layer isolation)", () => {
  it("provisions + signs in, deactivation blocks sign-in, safety rails hold, and org A cannot touch org B", async () => {
    // The seeded org-A ADMIN (acts on the surface). User is RLS-exempt → queryable without a GUC.
    const adminA = await prisma.user.findFirstOrThrow({ where: { organizationId: ORG_A, role: "ADMIN" }, select: { id: true } });

    // --- setup a SECOND tenant with its own admin (for the isolation test) ---
    await runWithOrg(ORG_B, async () => { await prisma.organization.create({ data: { id: ORG_B, name: "OPS4 Org B (e2e)" } }); });
    const userB = await createUser(ORG_B, { email: ORGB_ADMIN_EMAIL, name: "Org B Admin", role: "ADMIN" });

    // ================= 1) PROVISION + SIGN IN + LANDING =================
    const rev = await createUser(ORG_A, { email: REV_EMAIL, name: "OPS4 Rev", role: "REVIEWER" });
    expect(rev.isActive).toBe(true);
    expect(rev.role).toBe("REVIEWER");
    expect(await isEligibleForSignIn(REV_EMAIL)).toBe(true);

    // magic-link session lifecycle (exactly what Auth.js runs on callback) → session carries role+org
    const token = `ops4-${Date.now()}`;
    tokens.push(token);
    await adapter.createSession!({ sessionToken: token, userId: rev.id, expires: new Date(Date.now() + 3_600_000) });
    const su = await adapter.getSessionAndUser!(token);
    const enriched = enrichSession({ user: {} } as Session, su!.user);
    expect(enriched.user!.organizationId).toBe(ORG_A);
    expect(enriched.user!.role).toBe("REVIEWER"); // REVIEWER → cockpit landing (ADMIN/REVIEWER cockpit, PILOT field)

    // ================= 2) DEACTIVATION BLOCKS SIGN-IN =================
    await updateUser(ORG_A, rev.id, { name: "OPS4 Rev", role: "REVIEWER", isActive: false }, adminA.id);
    expect(await isEligibleForSignIn(REV_EMAIL)).toBe(false); // deactivated → denied at signIn
    await updateUser(ORG_A, rev.id, { name: "OPS4 Rev", role: "REVIEWER", isActive: true }, adminA.id);
    expect(await isEligibleForSignIn(REV_EMAIL)).toBe(true); // ADMIN can reactivate

    // ================= 3) APP-LAYER CROSS-ORG ISOLATION (RLS won't cover this) =================
    const listA = await listUsers(ORG_A);
    expect(listA.some((u) => u.id === userB.id)).toBe(false); // org A cannot SEE org B's user
    expect(listA.some((u) => u.email === REV_EMAIL)).toBe(true); // but sees its own
    await expect(updateUser(ORG_A, userB.id, { name: "hijack", role: "REVIEWER", isActive: true }, adminA.id)).rejects.toThrow(/not found in org/i);
    await expect(deleteUser(ORG_A, userB.id, adminA.id)).rejects.toThrow(/not found in org/i);
    // sanity: org B still owns its untouched admin
    const listB = await listUsers(ORG_B);
    expect(listB.some((u) => u.id === userB.id && u.role === "ADMIN" && u.isActive)).toBe(true);

    // ================= 4) SAFETY RAILS =================
    await expect(updateUser(ORG_A, adminA.id, { name: null, role: "ADMIN", isActive: false }, adminA.id)).rejects.toThrow(/deactivate yourself/i);
    await expect(deleteUser(ORG_A, adminA.id, adminA.id)).rejects.toThrow(/delete yourself/i);
    // adminA is the ONLY active ADMIN in org A — removing it (as a non-self actor) orphans the org
    await expect(deleteUser(ORG_A, adminA.id, rev.id)).rejects.toThrow(/last active ADMIN/i);
    await expect(updateUser(ORG_A, adminA.id, { name: null, role: "REVIEWER", isActive: true }, rev.id)).rejects.toThrow(/last active ADMIN/i);

    // seeded admin is untouched by all of the above
    const adminStill = await prisma.user.findFirstOrThrow({ where: { id: adminA.id, organizationId: ORG_A }, select: { role: true, isActive: true } });
    expect(adminStill).toEqual({ role: "ADMIN", isActive: true });
  });
});
