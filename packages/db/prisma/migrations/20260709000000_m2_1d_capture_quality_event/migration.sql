-- ============================================================================
-- M2-1d — CaptureQualityEvent: persist the radiometric fail-closed outcome (CR-11 / CR-22 / CR-25)
-- ============================================================================
-- A session-scoped, org-scoped record of a REJECTED capture (no usable radiometric channel). It is
-- DISTINCT from Anomaly: there is NO dispatch path by construction — no FK to/from WorkOrderDispatch,
-- no anomaly relation — so a data-quality event can never become a work order (fail closed). RLS
-- isolates it per tenant exactly like every other org-scoped table (M1-02 pattern, CR-20).

CREATE TABLE "CaptureQualityEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ingestionSessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "detectedFormat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaptureQualityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaptureQualityEvent_organizationId_createdAt_idx" ON "CaptureQualityEvent"("organizationId", "createdAt");
CREATE INDEX "CaptureQualityEvent_ingestionSessionId_idx" ON "CaptureQualityEvent"("ingestionSessionId");

ALTER TABLE "CaptureQualityEvent"
    ADD CONSTRAINT "CaptureQualityEvent_ingestionSessionId_fkey"
    FOREIGN KEY ("ingestionSessionId") REFERENCES "IngestionSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security: tenant isolation on the direct organizationId (M1-02, CR-20). A wrong/absent
-- app.current_org GUC yields zero rows and rejects writes (fail closed). app_current_org() is created
-- by the M1-02 RLS migration.
ALTER TABLE "CaptureQualityEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaptureQualityEvent" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CaptureQualityEvent";
CREATE POLICY tenant_isolation ON "CaptureQualityEvent"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());
