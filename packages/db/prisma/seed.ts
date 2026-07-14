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
 *   • 1 Pilot + verified & unverified PilotHardware airframes (M0-04, CR-11):
 *       - VERIFIED serial   → binds; capture proceeds
 *       - UNVERIFIED serial → registered but not NDAA-verified; fails closed
 */
import {
  PrismaClient,
  CaptureModality,
  DeliveryTargetType,
  OnboardingState,
  PilotTier,
  UserRole,
} from "../src/index";

// Seed runs as the superuser dz (BYPASSRLS) via directUrl — it writes every tenant table without a
// per-org GUC (M1-02, CR-20). A dedicated client (not the RLS-scoped runtime `prisma`) keeps the
// bypass explicit. Falls back to DATABASE_URL only if DIRECT_DATABASE_URL is unset.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
});

// Fail LOUD if the generated client is stale: a missing enum value would silently fall back to the
// column default and mis-seed a role (this is exactly how the pilot was once seeded as REVIEWER).
for (const role of ["ADMIN", "REVIEWER", "PILOT"] as const) {
  if (UserRole[role] === undefined) {
    throw new Error(`Prisma client is stale — UserRole.${role} is missing. Run \`prisma generate\` before seeding.`);
  }
}

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CONTRACT_ID = "00000000-0000-0000-0000-000000000002";
const RULESET_ID = "00000000-0000-0000-0000-000000000003";
const WEBHOOK_ID = "00000000-0000-0000-0000-000000000004";
const JIRA_ID = "00000000-0000-0000-0000-000000000005";
const PILOT_ID = "00000000-0000-0000-0000-000000000006";
const PILOT_INSURANCE_ID = "00000000-0000-0000-0000-0000000000b0";
const HW_VERIFIED_ID = "00000000-0000-0000-0000-000000000007";
const HW_UNVERIFIED_ID = "00000000-0000-0000-0000-000000000008";

// Concierge-provisioned cockpit users (M1-01, CR-20). No self-serve signup (CR-14).
const ADMIN_USER_ID = "00000000-0000-0000-0000-0000000000a0";
const REVIEWER_USER_ID = "00000000-0000-0000-0000-0000000000a1";
const PILOT_USER_ID = "00000000-0000-0000-0000-0000000000a2";
export const CONCIERGE_ADMIN_EMAIL = "admin@lighthouse-solar.example";
export const CONCIERGE_REVIEWER_EMAIL = "reviewer@lighthouse-solar.example";
export const CONCIERGE_PILOT_EMAIL = "pilot@lighthouse-solar.example";

// Airframe serials matched at ingestion against the verified registry (CR-11).
export const VERIFIED_AIRFRAME_SERIAL = "DZ-THERMAL-0001";
export const UNVERIFIED_AIRFRAME_SERIAL = "DZ-THERMAL-9999";

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
      // Canonical asset-label standard (CR-17): SITE_ID-ARRAY_ID-ROW_ID-STRING_ID.
      // SITE_ID (APEX_SOLAR = physical site) is intentionally distinct from the tenant org
      // "Lighthouse Solar O&M" (the operator); one operator runs many named sites.
      const label = `APEX_SOLAR-GRID_04-ROW_${String(r).padStart(2, "0")}-STR_${String(s).padStart(2, "0")}`;
      const latitude = (BASE_LAT + r * 0.00009).toFixed(6); // ~10m row spacing
      const longitude = (BASE_LON + s * 0.00011).toFixed(6);
      // Converge on re-seed: update existing rows to the canonical label + coords (CR-17 migration).
      await prisma.asset.upsert({
        where: { id: assetId(r, s) },
        update: { internalLabel: label, latitude, longitude },
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
      categoryPriority: { "1": "MONITOR", "2": "SCHEDULED", "3": "PROMPT" }, // M2-2c/CR-30 default, client-overridable
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

  // --- Pilot + verified airframe registry (M0-04, CR-11) ---
  // NDAA is enforced by THIS registry (serial match at ingestion), not in-browser attestation.
  const pilot = await prisma.pilot.upsert({
    where: { id: PILOT_ID },
    update: {},
    create: {
      id: PILOT_ID,
      organizationId: org.id,
      firstName: "Ada",
      lastName: "Skyler",
      email: "ada.skyler@lighthouse-solar.example",
      part107LicenseNum: "FA3X7K9P2M",
      licenseExpiry: new Date("2027-12-31T00:00:00Z"),
      tier: PilotTier.TIER_1_APEX_OP,
    },
  });

  // Verified airframe → binds; capture proceeds.
  await prisma.pilotHardware.upsert({
    where: { id: HW_VERIFIED_ID },
    update: {},
    create: {
      id: HW_VERIFIED_ID,
      pilotId: pilot.id,
      aircraftModel: "Skydio X10D",
      sensorType: CaptureModality.DRONE_THERMAL,
      serialNumber: VERIFIED_AIRFRAME_SERIAL,
      remoteIdSerial: VERIFIED_AIRFRAME_SERIAL,
      ndaaVerified: true,
      approvedListRef: "Blue UAS (DIU cleared list)",
      verifiedAt: new Date("2026-01-15T00:00:00Z"),
    },
  });

  // Registered but NOT NDAA-verified → fixture for the fail-closed path.
  await prisma.pilotHardware.upsert({
    where: { id: HW_UNVERIFIED_ID },
    update: {},
    create: {
      id: HW_UNVERIFIED_ID,
      pilotId: pilot.id,
      aircraftModel: "Generic Import Thermal",
      sensorType: CaptureModality.DRONE_THERMAL,
      serialNumber: UNVERIFIED_AIRFRAME_SERIAL,
      ndaaVerified: false,
    },
  });

  // Verified proof-of-coverage (M2-4a/CR-33) that SATISFIES the seeded ClientContract profile ($5M,
  // dedicated aviation + AI + P&NC + waiver) so the coverage gate + insurance surfaces have real
  // content. We VERIFY; we never bind/collect/resell (CR-03).
  await prisma.pilotInsurance.upsert({
    where: { id: PILOT_INSURANCE_ID },
    update: {},
    create: {
      id: PILOT_INSURANCE_ID,
      pilotId: pilot.id,
      kind: "BYO_ANNUAL",
      providerName: "SkyGuard Aviation (demo)",
      policyNumber: "DZ-DEMO-AV-0001",
      liabilityLimit: "5000000.00",
      isDedicatedAviation: true,
      hasBlanketAI: true,
      hasPrimaryNonContrib: true,
      hasWaiverOfSubrogation: true,
      isVerified: true,
      verificationSource: "MANUAL_QA",
      verifiedAt: new Date("2026-01-20T00:00:00Z"),
      coverageStart: new Date("2026-01-01T00:00:00Z"),
      coverageEnd: new Date("2027-12-31T00:00:00Z"),
    },
  });

  // --- Concierge cockpit users (M1-01, CR-20): magic-link auth, org-scoped + role ---
  await prisma.user.upsert({
    where: { id: ADMIN_USER_ID },
    update: { organizationId: org.id, role: UserRole.ADMIN, email: CONCIERGE_ADMIN_EMAIL },
    create: { id: ADMIN_USER_ID, organizationId: org.id, role: UserRole.ADMIN, email: CONCIERGE_ADMIN_EMAIL, name: "Concierge Admin" },
  });
  await prisma.user.upsert({
    where: { id: REVIEWER_USER_ID },
    update: { organizationId: org.id, role: UserRole.REVIEWER, email: CONCIERGE_REVIEWER_EMAIL },
    create: { id: REVIEWER_USER_ID, organizationId: org.id, role: UserRole.REVIEWER, email: CONCIERGE_REVIEWER_EMAIL, name: "QA Reviewer" },
  });
  // Field pilot (M1-04, CR-11): signs into the Infield Validator PWA; org derives from the session.
  await prisma.user.upsert({
    where: { id: PILOT_USER_ID },
    update: { organizationId: org.id, role: UserRole.PILOT, email: CONCIERGE_PILOT_EMAIL },
    create: { id: PILOT_USER_ID, organizationId: org.id, role: UserRole.PILOT, email: CONCIERGE_PILOT_EMAIL, name: "Field Pilot" },
  });

  console.log(
    `[seed] concierge tenant ready: org=${org.id} · ${assetCount} assets · 1 ruleset · 2 integrations · ` +
      `1 pilot · airframes(verified=${VERIFIED_AIRFRAME_SERIAL}, unverified=${UNVERIFIED_AIRFRAME_SERIAL}) · ` +
      `users(${CONCIERGE_ADMIN_EMAIL}, ${CONCIERGE_REVIEWER_EMAIL}, ${CONCIERGE_PILOT_EMAIL})`,
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
