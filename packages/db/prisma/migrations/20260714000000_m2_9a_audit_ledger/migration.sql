-- ============================================================================
-- M2-9a — AuditLogEntry: tamper-evident, append-only, hash-chained determination ledger (CR-41)
-- ============================================================================
-- Hardens CR-12's immutable audit trail. Each entry hash-chains to the prior one (per org):
--   contentHash = SHA-256(prevHash || canonical(core))
-- so any post-hoc edit breaks the chain, which `verifyAuditChain` detects. APPEND-ONLY is enforced
-- at the DB: the runtime role datumzero_app gets INSERT + SELECT only — UPDATE/DELETE are REVOKEd
-- (M1-02 ALTER DEFAULT PRIVILEGES would otherwise auto-grant them to the role on this dz-created
-- table). RLS isolates per tenant exactly like every org-scoped table (M1-02, CR-20). KMS signing
-- (non-repudiation) + external anchoring (RFC-3161 / OpenTimestamps) are later slices (M2-9b/c).

CREATE TYPE "AuditEntryType" AS ENUM ('MODEL_CALLBACK', 'QA_APPROVAL', 'QA_REJECTION');

CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "anomalyId" TEXT,
    "entryType" "AuditEntryType" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "prevHash" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLogEntry_organizationId_createdAt_idx" ON "AuditLogEntry"("organizationId", "createdAt");
CREATE INDEX "AuditLogEntry_anomalyId_idx" ON "AuditLogEntry"("anomalyId");

-- Row-Level Security: tenant isolation on the direct organizationId (M1-02, CR-20). app_current_org()
-- is created by the M1-02 RLS migration. A wrong/absent app.current_org GUC yields zero rows and
-- rejects writes (fail closed).
ALTER TABLE "AuditLogEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLogEntry" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditLogEntry";
CREATE POLICY tenant_isolation ON "AuditLogEntry"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());

-- APPEND-ONLY (CR-41): the runtime role may INSERT + SELECT but never UPDATE or DELETE a ledger
-- entry. M1-02's ALTER DEFAULT PRIVILEGES auto-granted SELECT/INSERT/UPDATE/DELETE to datumzero_app
-- on this (dz-created) table, so the UPDATE/DELETE grants are explicitly REVOKEd here — this is what
-- makes "immutable" a DB guarantee, not a code convention. Migrations/seed run as the elevated role
-- (directUrl) and are unaffected. TRUNCATE is never granted to the runtime role.
GRANT SELECT, INSERT ON "AuditLogEntry" TO datumzero_app;
REVOKE UPDATE, DELETE ON "AuditLogEntry" FROM datumzero_app;
