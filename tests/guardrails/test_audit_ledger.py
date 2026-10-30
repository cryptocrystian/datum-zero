"""
Guardrail for M2-9a — tamper-evident, append-only audit ledger (CR-41).

Asserts (statically, from the schema + migration + the ledger module):
  • the AuditLogEntry table exists with a hash-chain (contentHash + prevHash);
  • it is RLS-enabled + FORCEd + tenant_isolation policy'd (M1-02 pattern, CR-20) — note test_rls.py
    also auto-discovers it (it carries organizationId);
  • APPEND-ONLY is DB-enforced: UPDATE/DELETE are REVOKEd from the runtime role datumzero_app, and the
    role is (re)granted ONLY SELECT/INSERT — M1-02 default privileges would otherwise make it mutable;
  • verifyAuditChain is READ-ONLY (performs no create/update/delete).

The runtime PROOF that the role cannot UPDATE/DELETE a ledger row belongs with the RLS e2e; this suite
holds the static guarantee so the append-only property cannot silently regress.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "packages/db/prisma/schema.prisma"
MIGRATIONS = ROOT / "packages/db/prisma/migrations"
LEDGER = ROOT / "apps/web/lib/audit/ledger.ts"           # DB append/verify I/O
LEDGER_CHAIN = ROOT / "apps/web/lib/audit/ledger-chain.ts"  # PURE hash-chain math (no DB)


def _ledger_migration_sql():
    for f in MIGRATIONS.rglob("migration.sql"):
        text = f.read_text()
        if '"AuditLogEntry"' in text and "CREATE TABLE" in text:
            return text
    return ""


def test_ledger_table_and_hash_chain_present():
    sql = _ledger_migration_sql()
    assert sql, "no migration creates the AuditLogEntry table (M2-9a)"
    assert 'CREATE TABLE "AuditLogEntry"' in sql
    assert '"contentHash" TEXT NOT NULL' in sql, "hash-chain needs a contentHash column"
    assert '"prevHash" TEXT' in sql, "hash-chain needs a prevHash link column"
    model = re.search(r"model\s+AuditLogEntry\s*\{(.*?)\}", SCHEMA.read_text(), re.S)
    assert model, "AuditLogEntry model missing from schema.prisma"
    assert "contentHash" in model.group(1) and "prevHash" in model.group(1)


def test_ledger_is_rls_isolated():
    sql = _ledger_migration_sql()
    assert '"AuditLogEntry" ENABLE ROW LEVEL SECURITY' in sql
    assert re.search(r'"AuditLogEntry"\s+FORCE\s+ROW LEVEL SECURITY', sql)
    assert 'CREATE POLICY tenant_isolation ON "AuditLogEntry"' in sql


def test_ledger_is_append_only_for_the_runtime_role():
    sql = _ledger_migration_sql()
    # UPDATE + DELETE revoked from the runtime role — the append-only GUARANTEE (CR-41).
    assert re.search(
        r'REVOKE\s+UPDATE,\s*DELETE\s+ON\s+"AuditLogEntry"\s+FROM\s+datumzero_app', sql
    ), "append-only requires REVOKE UPDATE, DELETE ON AuditLogEntry FROM datumzero_app (M1-02 default privileges grant them)"
    # the role must NOT be (re)granted UPDATE or DELETE on this table anywhere.
    for grant in re.findall(r'GRANT\s+([^;]*?)\s+ON\s+"AuditLogEntry"\s+TO\s+datumzero_app', sql):
        assert "UPDATE" not in grant.upper(), "runtime role must not be granted UPDATE on AuditLogEntry"
        assert "DELETE" not in grant.upper(), "runtime role must not be granted DELETE on AuditLogEntry"


def test_pure_chain_math_has_no_db_coupling():
    assert LEDGER_CHAIN.exists(), "pure ledger-chain module missing (M2-9a)"
    src = LEDGER_CHAIN.read_text()
    assert "export function verifyChain" in src
    assert "export function contentHashOf" in src
    # The pure module must stay DB-free so the integrity logic is unit-testable without a client.
    assert "@dz/db" not in src and "PrismaClient" not in src, "ledger-chain must not import the DB client"


def test_verify_audit_chain_is_read_only():
    assert LEDGER.exists(), "ledger module missing (M2-9a)"
    src = LEDGER.read_text()
    assert "export async function verifyAuditChain" in src
    assert "export async function appendAuditEntry" in src
    # Isolate the verifyAuditChain body and assert it never writes.
    m = re.search(r"export async function verifyAuditChain\b.*?\n\}", src, re.S)
    assert m, "could not isolate verifyAuditChain body"
    body = m.group(0)
    for write in [
        ".create(",
        ".update(",
        ".delete(",
        ".upsert(",
        ".createMany(",
        ".updateMany(",
        ".deleteMany(",
        "executeRaw",
    ]:
        assert write not in body, f"verifyAuditChain must be read-only — found {write}"
