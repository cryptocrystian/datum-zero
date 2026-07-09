import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// --- env: DATABASE_URL from repo .env locally (CI sets it as job env) ---
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL.
}

import { PrismaClient } from "@dz/db";

/**
 * M1-02 — Postgres RLS tenant isolation, proven at the DB layer (CR-20).
 *
 * This connects as the RUNTIME app role (DATABASE_URL = datumzero_app, non-superuser/non-BYPASSRLS)
 * using a RAW client — NOT the RLS-extension client and NOT the app's organizationId filters — so
 * the isolation shown here is Postgres's, independent of any app-layer scoping. A wrong/absent
 * `app.current_org` must yield zero rows and reject writes (fail closed).
 */
const ORG = "00000000-0000-0000-0000-000000000001"; // seeded concierge tenant
const OTHER = "00000000-0000-0000-0000-0000000000ff"; // a different tenant
const ORG_ASSET = "00000000-0000-0001-0001-000000000001"; // seeded Asset r1s1 (belongs to ORG)

// Raw client as datumzero_app — deliberately NOT the @dz/db RLS-scoped `prisma`.
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// set_config(..., true) is transaction-local, so each SET LOCAL rides the interactive tx connection.
function setOrg(tx: PrismaClient, org: string) {
  return tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, org);
}

beforeAll(async () => {
  await db.$connect();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("M1-02 RLS — tenant isolation proven at the DB layer (as datumzero_app)", () => {
  it("the runtime app role is non-superuser and non-BYPASSRLS", async () => {
    const rows = await db.$queryRawUnsafe<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
  });

  it("absent app.current_org → zero rows (fail closed)", async () => {
    const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "Asset"`);
    expect(rows[0].n).toBe(0);
  });

  it("correct app.current_org → the tenant's rows are visible", async () => {
    const rows = await db.$transaction(async (tx) => {
      await setOrg(tx as unknown as PrismaClient, ORG);
      return tx.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "Asset"`);
    });
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("wrong app.current_org → zero cross-org rows (SELECT)", async () => {
    const rows = await db.$transaction(async (tx) => {
      await setOrg(tx as unknown as PrismaClient, OTHER);
      return tx.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "Asset"`);
    });
    expect(rows[0].n).toBe(0);
  });

  it("child table (MediaAsset) is isolated via its parent session's org", async () => {
    const wrong = await db.$transaction(async (tx) => {
      await setOrg(tx as unknown as PrismaClient, OTHER);
      return tx.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "MediaAsset"`);
    });
    expect(wrong[0].n).toBe(0);
  });

  it("wrong app.current_org → a cross-org UPDATE touches zero rows (USING)", async () => {
    const affected = await db.$transaction(async (tx) => {
      await setOrg(tx as unknown as PrismaClient, OTHER);
      return tx.$executeRawUnsafe(`UPDATE "Asset" SET "internalLabel" = 'RLS_PROBE' WHERE id = $1`, ORG_ASSET);
    });
    expect(affected).toBe(0);
  });

  it("reassigning a row out of the current org is rejected (WITH CHECK)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await setOrg(tx as unknown as PrismaClient, ORG);
        // USING passes (row is ORG's), but the NEW organizationId violates WITH CHECK → reject.
        await tx.$executeRawUnsafe(`UPDATE "Asset" SET "organizationId" = $1 WHERE id = $2`, OTHER, ORG_ASSET);
      }),
    ).rejects.toThrow();
  });

  it("CaptureQualityEvent is visible only within its org (direct-organizationId RLS, CR-25)", async () => {
    const sessionId = "rls-probe-cqe-session";
    const eventId = "rls-probe-cqe-event";
    // Seed a session + event under ORG (WITH CHECK passes: org = ORG). IDs are TEXT, not native uuid.
    await db.$transaction(async (tx) => {
      await setOrg(tx as unknown as PrismaClient, ORG);
      await tx.$executeRawUnsafe(
        `INSERT INTO "IngestionSession" (id, "organizationId", modality, "pilotOrNodeId", "rawStoragePath")
         VALUES ($1, $2, 'DRONE_THERMAL', 'rls-probe', 's3://rls/probe') ON CONFLICT (id) DO NOTHING`,
        sessionId, ORG,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "CaptureQualityEvent" (id, "organizationId", "ingestionSessionId", status, reason)
         VALUES ($1, $2, $3, 'UNKNOWN_FORMAT', 'rls-probe') ON CONFLICT (id) DO NOTHING`,
        eventId, ORG, sessionId,
      );
    });
    const mine = await db.$transaction(async (tx) => {
      await setOrg(tx as unknown as PrismaClient, ORG);
      return tx.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM "CaptureQualityEvent" WHERE id = $1`, eventId,
      );
    });
    expect(mine[0].n).toBe(1);
    const theirs = await db.$transaction(async (tx) => {
      await setOrg(tx as unknown as PrismaClient, OTHER);
      return tx.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM "CaptureQualityEvent" WHERE id = $1`, eventId,
      );
    });
    expect(theirs[0].n).toBe(0);
    // Cleanup (as ORG) so the suite stays repeatable.
    await db.$transaction(async (tx) => {
      await setOrg(tx as unknown as PrismaClient, ORG);
      await tx.$executeRawUnsafe(`DELETE FROM "CaptureQualityEvent" WHERE id = $1`, eventId);
      await tx.$executeRawUnsafe(`DELETE FROM "IngestionSession" WHERE id = $1`, sessionId);
    });
  });
});
