-- CreateEnum
CREATE TYPE "OnboardingState" AS ENUM ('CONCIERGE_PROVISIONED', 'SELF_SERVE');

-- CreateEnum
CREATE TYPE "CaptureModality" AS ENUM ('DRONE_ORTHOMOSAIC', 'DRONE_THERMAL', 'HANDHELD_360_VIDEO', 'CRANE_LASER_SCAN', 'STATIONARY_IOT_SENSOR');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('PENDING_QA', 'APPROVED_DISPATCHED', 'REJECTED_FALSE_POSITIVE', 'LOGGED_INTERNAL');

-- CreateEnum
CREATE TYPE "PilotTier" AS ENUM ('TIER_3_ROGUE', 'TIER_2_LEAD', 'TIER_1_APEX_OP');

-- CreateEnum
CREATE TYPE "InsuranceKind" AS ENUM ('BYO_ANNUAL', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('PROVIDER_API', 'COI_VENDOR', 'MANUAL_QA');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('ASSIGNED', 'DATA_UPLOADED', 'QA_CLEARED', 'FUNDS_DISPATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryTargetType" AS ENUM ('GENERIC_WEBHOOK', 'PDF_DISPATCH', 'CSV_S3', 'NATIVE_JIRA', 'NATIVE_SERVICENOW', 'NATIVE_PROCORE', 'NATIVE_MAXIMO', 'NATIVE_SAP_PM');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboardingState" "OnboardingState" NOT NULL DEFAULT 'CONCIERGE_PROVISIONED',

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiredLiabilityLimit" DECIMAL(14,2) NOT NULL,
    "requiresDedicatedAviation" BOOLEAN NOT NULL DEFAULT true,
    "requiresAdditionalInsured" BOOLEAN NOT NULL DEFAULT true,
    "requiresPrimaryNonContrib" BOOLEAN NOT NULL DEFAULT true,
    "requiresWaiverOfSubrogation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "internalLabel" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "geoBoundary" JSONB,
    "cadObjectId" TEXT,
    "erpAssetId" TEXT,
    "procoreLocationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "modality" "CaptureModality" NOT NULL,
    "pilotOrNodeId" TEXT NOT NULL,
    "rawStoragePath" TEXT NOT NULL,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "isNdaaVerified" BOOLEAN NOT NULL DEFAULT false,
    "boundHardwareId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "ingestionSessionId" TEXT NOT NULL,
    "fullStoragePath" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anomaly" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "boundingBox" INTEGER[],
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "zAxisOffset" DOUBLE PRECISION,
    "standardRef" TEXT,
    "classification" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "metricDelta" DOUBLE PRECISION NOT NULL,
    "metricUnit" TEXT,
    "visualCropUrl" TEXT NOT NULL,
    "analyticsCropUrl" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING_QA',
    "recommendation" TEXT,
    "ruleSetId" TEXT,
    "modelVersion" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSet" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetModality" "CaptureModality" NOT NULL,
    "triggerMetric" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "thresholdValue" DOUBLE PRECISION NOT NULL,
    "standardRef" TEXT,
    "standardVersion" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "routeTargets" TEXT[],

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pilot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "part107LicenseNum" TEXT NOT NULL,
    "licenseExpiry" TIMESTAMP(3) NOT NULL,
    "stripeConnectId" TEXT,
    "tier" "PilotTier" NOT NULL DEFAULT 'TIER_3_ROGUE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotHardware" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "aircraftModel" TEXT NOT NULL,
    "sensorType" "CaptureModality" NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "remoteIdSerial" TEXT,
    "ndaaVerified" BOOLEAN NOT NULL DEFAULT false,
    "approvedListRef" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "PilotHardware_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotInsurance" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "kind" "InsuranceKind" NOT NULL,
    "providerName" TEXT NOT NULL,
    "policyNumber" TEXT,
    "liabilityLimit" DECIMAL(14,2) NOT NULL,
    "isDedicatedAviation" BOOLEAN NOT NULL DEFAULT false,
    "hasBlanketAI" BOOLEAN NOT NULL DEFAULT false,
    "hasPrimaryNonContrib" BOOLEAN NOT NULL DEFAULT false,
    "hasWaiverOfSubrogation" BOOLEAN NOT NULL DEFAULT false,
    "certificateUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationSource" "VerificationSource",
    "verifiedAt" TIMESTAMP(3),
    "coverageStart" TIMESTAMP(3),
    "coverageEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotInsurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientContractId" TEXT,
    "pilotId" TEXT NOT NULL,
    "ingestionSessionId" TEXT,
    "siteAddress" TEXT NOT NULL,
    "targetCoordinates" TEXT NOT NULL,
    "payoutAmount" DECIMAL(10,2) NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'ASSIGNED',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "coverageVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetType" "DeliveryTargetType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secretVaultKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderDispatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "anomalyId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastStatus" INTEGER,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "retryAfter" TIMESTAMP(3),
    "downstreamRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientContract_organizationId_idx" ON "ClientContract"("organizationId");

-- CreateIndex
CREATE INDEX "Asset_organizationId_internalLabel_idx" ON "Asset"("organizationId", "internalLabel");

-- CreateIndex
CREATE INDEX "Asset_organizationId_latitude_longitude_idx" ON "Asset"("organizationId", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "IngestionSession_organizationId_idx" ON "IngestionSession"("organizationId");

-- CreateIndex
CREATE INDEX "Anomaly_organizationId_status_idx" ON "Anomaly"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Anomaly_assetId_idx" ON "Anomaly"("assetId");

-- CreateIndex
CREATE INDEX "RuleSet_organizationId_idx" ON "RuleSet"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Pilot_email_key" ON "Pilot"("email");

-- CreateIndex
CREATE INDEX "PilotInsurance_pilotId_idx" ON "PilotInsurance"("pilotId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionAssignment_ingestionSessionId_key" ON "MissionAssignment"("ingestionSessionId");

-- CreateIndex
CREATE INDEX "MissionAssignment_organizationId_idx" ON "MissionAssignment"("organizationId");

-- CreateIndex
CREATE INDEX "Integration_organizationId_idx" ON "Integration"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderDispatch_idempotencyKey_key" ON "WorkOrderDispatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkOrderDispatch_organizationId_isResolved_idx" ON "WorkOrderDispatch"("organizationId", "isResolved");

-- AddForeignKey
ALTER TABLE "ClientContract" ADD CONSTRAINT "ClientContract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionSession" ADD CONSTRAINT "IngestionSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionSession" ADD CONSTRAINT "IngestionSession_boundHardwareId_fkey" FOREIGN KEY ("boundHardwareId") REFERENCES "PilotHardware"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ingestionSessionId_fkey" FOREIGN KEY ("ingestionSessionId") REFERENCES "IngestionSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RuleSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pilot" ADD CONSTRAINT "Pilot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotHardware" ADD CONSTRAINT "PilotHardware_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotInsurance" ADD CONSTRAINT "PilotInsurance_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionAssignment" ADD CONSTRAINT "MissionAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionAssignment" ADD CONSTRAINT "MissionAssignment_clientContractId_fkey" FOREIGN KEY ("clientContractId") REFERENCES "ClientContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionAssignment" ADD CONSTRAINT "MissionAssignment_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionAssignment" ADD CONSTRAINT "MissionAssignment_ingestionSessionId_fkey" FOREIGN KEY ("ingestionSessionId") REFERENCES "IngestionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderDispatch" ADD CONSTRAINT "WorkOrderDispatch_anomalyId_fkey" FOREIGN KEY ("anomalyId") REFERENCES "Anomaly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderDispatch" ADD CONSTRAINT "WorkOrderDispatch_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
