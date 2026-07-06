"""
Guardrails for M1-02 — Postgres Row-Level Security tenant isolation, defense-in-depth (CR-20).

Asserts (statically, from the schema + migration + @dz/db source):
  • every Organization-scoped table ENABLEs + FORCEs RLS with a tenant_isolation policy;
  • the policies key on the app.current_org GUC (USING + WITH CHECK);
  • the runtime app role datumzero_app is non-superuser / non-BYPASSRLS;
  • the auth substrate (User/Account/Session/VerificationToken) is intentionally EXEMPT;
  • the @dz/db extension binds the org (runWithOrg / AsyncLocalStorage) and sets the GUC.

The runtime PROOF that a wrong/absent GUC yields zero rows + rejected writes lives in
apps/web/e2e/rls.e2e.ts (executed against Postgres as datumzero_app).

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "packages/db/prisma/schema.prisma"
MIGRATIONS = ROOT / "packages/db/prisma/migrations"
DB_INDEX = ROOT / "packages/db/src/index.ts"

# Auth substrate — resolves identity BEFORE any org context exists, so it is RLS-EXEMPT by design.
AUTH_EXEMPT = {"User", "Account", "Session", "VerificationToken"}
# Child tables with no organizationId column — RLS'd via an EXISTS subquery on their org-scoped parent.
CHILD_TABLES = {"MediaAsset", "PilotHardware", "PilotInsurance"}
# The tenant root (policy keyed on id).
ROOT_TABLE = {"Organization"}


def _rls_sql():
    sql = ""
    for f in MIGRATIONS.rglob("migration.sql"):
        text = f.read_text()
        if "ROW LEVEL SECURITY" in text and "tenant_isolation" in text:
            sql += "\n" + text
    return sql


def _org_scoped_models():
    """Model names carrying an organizationId column (the tenant-owned tables)."""
    src = SCHEMA.read_text()
    scoped = set()
    for m in re.finditer(r"model\s+(\w+)\s*\{(.*?)\}", src, re.S):
        if re.search(r"\borganizationId\b", m.group(2)):
            scoped.add(m.group(1))
    return scoped


def test_every_org_scoped_table_has_rls_enabled_forced_and_policy():
    sql = _rls_sql()
    assert sql, "no RLS migration found"
    # Must be protected: org-scoped models (minus the auth-exempt User) + child tables + the root.
    must = (_org_scoped_models() - AUTH_EXEMPT) | CHILD_TABLES | ROOT_TABLE
    # Sanity: the discovery actually found the core tenant tables (guards a broken regex).
    assert {"Asset", "Anomaly", "WorkOrderDispatch", "Pilot"} <= must
    for table in sorted(must):
        assert re.search(rf'"{table}"\s+ENABLE ROW LEVEL SECURITY', sql), f"{table} missing ENABLE ROW LEVEL SECURITY"
        assert re.search(rf'"{table}"\s+FORCE\s+ROW LEVEL SECURITY', sql), f"{table} missing FORCE ROW LEVEL SECURITY"
        assert f'CREATE POLICY tenant_isolation ON "{table}"' in sql, f"{table} missing tenant_isolation policy"


def test_policies_key_on_the_app_current_org_guc():
    sql = _rls_sql()
    assert "current_setting('app.current_org', true)" in sql, "GUC accessor must read app.current_org (missing_ok)"
    assert "app_current_org()" in sql, "policies must use the app_current_org() accessor"
    # every tenant_isolation policy carries WITH CHECK (write isolation), not just USING (read).
    assert sql.count("WITH CHECK") >= sql.count("CREATE POLICY tenant_isolation"), "every policy needs WITH CHECK"


def test_app_role_is_non_superuser_and_non_bypassrls():
    sql = _rls_sql()
    assert "CREATE ROLE datumzero_app" in sql, "must create the least-privilege runtime app role"
    assert "NOSUPERUSER" in sql and "NOBYPASSRLS" in sql, "the app role must not be able to bypass RLS"


def test_auth_substrate_is_exempt():
    sql = _rls_sql()
    for t in AUTH_EXEMPT:
        assert f'"{t}" ENABLE ROW LEVEL SECURITY' not in sql, f"{t} is auth substrate — it must NOT be RLS-enabled"


def test_db_extension_binds_org_and_sets_the_guc():
    src = DB_INDEX.read_text()
    assert "AsyncLocalStorage" in src, "the org context must ride AsyncLocalStorage"
    assert "export function runWithOrg" in src, "@dz/db must expose runWithOrg to bind the tenant org"
    assert "set_config('app.current_org'" in src, "the extension must SET the app.current_org GUC per tenant query"
    assert "$allOperations" in src, "the extension must wrap every model operation"
