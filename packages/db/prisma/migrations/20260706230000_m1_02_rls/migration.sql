-- ============================================================================
-- M1-02 — Postgres Row-Level Security: tenant isolation, defense-in-depth (CR-20)
-- ============================================================================
-- Dual-role topology:
--   • Runtime (Next.js app + BullMQ worker) connects as the least-privilege, non-superuser role
--     `datumzero_app`, which is SUBJECT to RLS. The @dz/db Prisma extension sets the transaction-
--     local GUC `app.current_org` on every tenant query (from the authenticated session).
--   • Migrations + seed run as the superuser `dz` (BYPASSRLS) via `directUrl` — they bypass RLS,
--     so seeding needs no GUC.
-- Every org-scoped table ENABLEs + FORCEs RLS with USING/WITH CHECK policies keyed on
-- `app.current_org`. A wrong/absent GUC yields zero rows and rejects writes (fail closed).
-- EXEMPT: the auth substrate (User/Account/Session/VerificationToken) — sign-in resolves a user
-- BEFORE any org context exists, so RLS there would break authentication.
-- ============================================================================

-- 1) Least-privilege application role (non-superuser, non-BYPASSRLS). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'datumzero_app') THEN
    CREATE ROLE datumzero_app LOGIN PASSWORD 'dz_app_local_dev'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- 2) GUC accessor — returns the org id as text (PKs are Prisma String/text, not native uuid).
--    NULL when unset/empty so an unscoped tenant query fails closed (zero rows), never errors.
CREATE OR REPLACE FUNCTION app_current_org() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_org', true), '') $$;

-- 3) Least-privilege grants — DML only, no DDL, no ownership. Future tables/sequences created by
--    the migration role (dz) are covered via default privileges.
GRANT USAGE ON SCHEMA public TO datumzero_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO datumzero_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO datumzero_app;
GRANT EXECUTE ON FUNCTION app_current_org() TO datumzero_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO datumzero_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO datumzero_app;

-- 4) Enable + FORCE RLS with tenant-isolation policies.

-- 4a) Tables with a direct organizationId column — strict equality to the GUC.
ALTER TABLE "Organization"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization"      FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
CREATE POLICY tenant_isolation ON "Organization"
  USING ("id" = app_current_org()) WITH CHECK ("id" = app_current_org());

ALTER TABLE "ClientContract"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientContract"    FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClientContract";
CREATE POLICY tenant_isolation ON "ClientContract"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());

ALTER TABLE "Asset"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Asset"             FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Asset";
CREATE POLICY tenant_isolation ON "Asset"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());

ALTER TABLE "IngestionSession"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IngestionSession"  FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IngestionSession";
CREATE POLICY tenant_isolation ON "IngestionSession"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());

ALTER TABLE "Anomaly"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Anomaly"           FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Anomaly";
CREATE POLICY tenant_isolation ON "Anomaly"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());

ALTER TABLE "RuleSet"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RuleSet"           FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RuleSet";
CREATE POLICY tenant_isolation ON "RuleSet"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());

ALTER TABLE "MissionAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MissionAssignment" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MissionAssignment";
CREATE POLICY tenant_isolation ON "MissionAssignment"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());

ALTER TABLE "Integration"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Integration"       FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Integration";
CREATE POLICY tenant_isolation ON "Integration"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());

ALTER TABLE "WorkOrderDispatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkOrderDispatch" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "WorkOrderDispatch";
CREATE POLICY tenant_isolation ON "WorkOrderDispatch"
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());

-- 4b) Pilot — organizationId is NULLABLE (null = the shared Datum Zero marketplace pool, visible to
--     every tenant). Allow the current org's pilots AND the marketplace pool. (CR-11)
ALTER TABLE "Pilot"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pilot"             FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Pilot";
CREATE POLICY tenant_isolation ON "Pilot"
  USING ("organizationId" = app_current_org() OR "organizationId" IS NULL)
  WITH CHECK ("organizationId" = app_current_org() OR "organizationId" IS NULL);

-- 4c) Child tables with NO organizationId column — scoped via an EXISTS subquery against their
--     org-scoped parent (the parent's own RLS also applies, so the same GUC governs both).
ALTER TABLE "MediaAsset"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaAsset"        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MediaAsset";
CREATE POLICY tenant_isolation ON "MediaAsset"
  USING (EXISTS (SELECT 1 FROM "IngestionSession" s
                 WHERE s."id" = "MediaAsset"."ingestionSessionId" AND s."organizationId" = app_current_org()))
  WITH CHECK (EXISTS (SELECT 1 FROM "IngestionSession" s
                 WHERE s."id" = "MediaAsset"."ingestionSessionId" AND s."organizationId" = app_current_org()));

ALTER TABLE "PilotHardware"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PilotHardware"     FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PilotHardware";
CREATE POLICY tenant_isolation ON "PilotHardware"
  USING (EXISTS (SELECT 1 FROM "Pilot" p
                 WHERE p."id" = "PilotHardware"."pilotId" AND (p."organizationId" = app_current_org() OR p."organizationId" IS NULL)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Pilot" p
                 WHERE p."id" = "PilotHardware"."pilotId" AND (p."organizationId" = app_current_org() OR p."organizationId" IS NULL)));

ALTER TABLE "PilotInsurance"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PilotInsurance"    FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PilotInsurance";
CREATE POLICY tenant_isolation ON "PilotInsurance"
  USING (EXISTS (SELECT 1 FROM "Pilot" p
                 WHERE p."id" = "PilotInsurance"."pilotId" AND (p."organizationId" = app_current_org() OR p."organizationId" IS NULL)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Pilot" p
                 WHERE p."id" = "PilotInsurance"."pilotId" AND (p."organizationId" = app_current_org() OR p."organizationId" IS NULL)));

-- Auth substrate (User/Account/Session/VerificationToken) is intentionally NOT RLS-enabled:
-- authentication must resolve a user before any tenant context exists. User-org isolation is
-- enforced at the app/session layer (the session's organizationId drives every tenant query).
