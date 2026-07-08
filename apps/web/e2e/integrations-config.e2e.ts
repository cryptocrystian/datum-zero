import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL.
}

import { prisma, runWithOrg } from "@dz/db";
import { createIntegration, deleteIntegration } from "@/lib/integrations/admin";
import { createRuleSet, listAllowedRouteTargets } from "@/lib/rules/ruleset-admin";

const ORG = "00000000-0000-0000-0000-000000000001";

async function cleanup() {
  await runWithOrg(ORG, async () => {
    // RuleSets first (they reference the integration's targetType), then the test integration.
    await prisma.ruleSet.deleteMany({ where: { organizationId: ORG, targetModality: "DRONE_ORTHOMOSAIC" } });
    await prisma.integration.deleteMany({ where: { organizationId: ORG, targetType: "CSV_S3" } });
  });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("OPS-2 — a UI-authored integration becomes a selectable RuleSet routeTarget", () => {
  it("adds a delivery target, which then routes a policy — and is protected from orphaning", () =>
    runWithOrg(ORG, async () => {
      // 1) The seed org routes to GENERIC_WEBHOOK + NATIVE_JIRA only — CSV_S3 is not yet selectable.
      const before = await listAllowedRouteTargets(ORG);
      expect(before).not.toContain("CSV_S3");

      // 2) AUTHOR a new integration through the same DAL the cockpit action calls (non-secret config).
      const integration = await createIntegration(ORG, {
        targetType: "CSV_S3",
        displayName: "E2E CSV drop",
        config: { bucket: "e2e-datum-zero", prefix: "dz/" },
        secretVaultKey: "datumzero/csv/hmac", // a REFERENCE, never a raw secret
        isActive: true,
      });
      expect(integration.secretVaultKey).toBe("datumzero/csv/hmac");

      // 3) It is now selectable as a RuleSet routeTarget.
      const after = await listAllowedRouteTargets(ORG);
      expect(after).toContain("CSV_S3");

      // 4) A policy can actually route to it (createRuleSet validates routeTargets ⊆ active integrations).
      const policy = await createRuleSet(ORG, {
        name: "Orthomosaic — CSV drop",
        targetModality: "DRONE_ORTHOMOSAIC",
        triggerMetric: "Temp_Delta_Threshold",
        operator: ">=",
        thresholdValue: 10,
        routeTargets: ["CSV_S3"],
        standardRef: "IEC TS 62446-3",
        standardVersion: "2017",
        isTemplate: false,
      });
      expect(policy.routeTargets).toContain("CSV_S3");

      // 5) REFERENTIAL SAFETY: the integration is now the sole active CSV_S3 target for a live policy —
      //    deleting it would orphan that route, so it must be refused.
      await expect(deleteIntegration(ORG, integration.id)).rejects.toThrow(/orphan|re-route|cannot delete/i);
    }));
});
