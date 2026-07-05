/**
 * Concierge onboarding seed (ticket M0-03).
 *
 * M1 has NO self-serve registration — tenants are provisioned manually here (CR-14).
 * Idempotent: fixed UUIDs + upserts, so re-running never duplicates.
 *
 * Creates the first lighthouse tenant:
 *   • 1 Organization (CONCIERGE_PROVISIONED)
 *   • 1 ClientContract carrying the required insurance PROFILE (CR-02/09) — utilities-grade $5M
 *   • A small, regular PV string grid with real lat/long (spatial-binding fixtures, CR-13)
 *   • 1 standards-anchored RuleSet template (IEC TS 62446-3, CR-15)
 *   • 2 delivery Integrations: GENERIC_WEBHOOK + NATIVE_JIRA sandbox (CR-05/14)
 */
import { prisma, CaptureModality, DeliveryTargetType, OnboardingState } from "../src/index";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CONTRACT_ID = "00000000-0000-0000-0000-000000000002";
const RULESET_ID = "00000000-0000-0000-0000-000000000003";
const WEBHOOK_ID = "00000000-0000-0000-0000-000000000004";
const JIRA_ID = "00000000-0000-0000-0000-000000000005";

// Example high-DNI solar site (near Tucson, AZ). Regular geometry → deterministic spatial binding.
const BASE_LAT = 32.2226;
const BASE_LON = -110.9747;
const ROWS = 4;
const STRINGS = 6;

const assetId = (r: number, s: number) =>
  `00000000-0000-0001-${String(r).padStart(4, "0")}-${String(s).padStart(12, "0")}`;

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: "Lighthouse Solar O&M (concierge tenant)",
      onboardingState: OnboardingState.CONCIERGE_PROVISIONED,
    },
  });

  await prisma.clientContract.upsert({
    where: { id: CONTRACT_ID },
    update: {},
    create: {
      id: CONTRACT_ID,
      organizationId: org.id,
      name: "Master Inspection Agreement",
      requiredLiabilityLimit: "5000000.00", // utilities/O&G grade (CR-02)
      requiresDedicatedAviation: true,
      requiresAdditionalInsured: true,
      requiresPrimaryNonContrib: true,
      requiresWaiverOfSubrogation: true,
    },
  });

  let assetCount = 0;
  for (let r = 1; r <= ROWS; r++) {
    for (let s = 1; s <= STRINGS; s++) {
      const label = `PV_ARRAY_04-ROW_${String(r).padStart(2, "0")}-STR_${String(s).padStart(2, "0")}`;
      const latitude = (BASE_LAT + r * 0.00009).toFixed(6); // ~10m row spacing
      const longitude = (BASE_LON + s * 0.00011).toFixed(6);
      await prisma.asset.upsert({
        where: { id: assetId(r, s) },
        update: {},
        create: { id: assetId(r, s), organizationId: org.id, internalLabel: label, latitude, longitude },
      });
      assetCount++;
    }
  }

  await prisma.ruleSet.upsert({
    where: { id: RULESET_ID },
    update: {},
    create: {
      id: RULESET_ID,
      organizationId: org.id,
      name: "Solar thermal — hot string (IEC TS 62446-3)",
      targetModality: CaptureModality.DRONE_THERMAL,
      triggerMetric: "Temp_Delta_Threshold",
      operator: ">=",
      thresholdValue: 10, // °C delta vs. ambient — classify per the standard's matrix (CR-15)
      standardRef: "IEC TS 62446-3",
      standardVersion: "2017",
      isTemplate: true,
      version: 1,
      routeTargets: ["GENERIC_WEBHOOK", "NATIVE_JIRA"],
    },
  });

  await prisma.integration.upsert({
    where: { id: WEBHOOK_ID },
    update: {},
    create: {
      id: WEBHOOK_ID,
      organizationId: org.id,
      targetType: DeliveryTargetType.GENERIC_WEBHOOK,
      displayName: "Generic Webhook (client IT endpoint)",
      config: { url: "https://example.invalid/webhooks/datum-zero" }, // placeholder
      isActive: true,
    },
  });

  await prisma.integration.upsert({
    where: { id: JIRA_ID },
    update: {},
    create: {
      id: JIRA_ID,
      organizationId: org.id,
      targetType: DeliveryTargetType.NATIVE_JIRA,
      displayName: "Jira Cloud (M0 sandbox)",
      // Secret token lives in AWS Secrets Manager, NEVER in the DB (MANIFEST §3).
      config: { baseUrl: "https://your-org.atlassian.net", projectKey: "DZ" },
      secretVaultKey: "dz/dev/jira-sandbox",
      isActive: true,
    },
  });

  console.log(
    `[seed] concierge tenant ready: org=${org.id} · ${assetCount} assets · 1 ruleset · 2 integrations`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
