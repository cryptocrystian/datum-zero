"""
Guardrails for M1-01/0a — data-access-layer session validation (CR-20).

Every mutation, server action, and protected API route must INDEPENDENTLY validate the session
against the DB (requireSession/getSession → auth() → DB) and derive org + reviewer from it —
never trusting the middleware cookie gate or that the page layout rendered.

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
SESSION = WEB / "lib/session.ts"
ACTIONS = WEB / "app/(cockpit)/queue/actions.ts"
AUDIT_ROUTE = WEB / "app/api/v1/audit/provenance/[dispatchId]/route.ts"
STUB_ORG = "00000000-0000-0000-0000-000000000001"

# Tenant mutations that must never run without a validated session behind them.
TENANT_MUTATIONS = ("approveAnomaly", "rejectAnomaly", "bindAnomalyToAsset", "dispatchAnomaly")


def _app_ts_files():
    for f in list((WEB / "app").rglob("*.ts")) + list((WEB / "app").rglob("*.tsx")):
        if ".next" in f.parts or "node_modules" in f.parts:
            continue
        yield f


def test_authoritative_session_chain_is_db_validated():
    src = SESSION.read_text()
    # requireSession → getSession → auth() (database strategy). THE authoritative check; fail closed.
    assert "export async function getSession" in src and "await auth()" in src, "getSession must hit auth()→DB"
    assert "export async function requireSession" in src and "getSession()" in src, "requireSession must use getSession"
    assert "throw" in src, "requireSession must fail closed"


def test_each_mutation_independently_validates_session():
    src = ACTIONS.read_text()
    # approve + reject + bind each call requireSession — not once, shared, or layout-assumed.
    assert src.count("requireSession(") >= 3, "every mutation must independently call requireSession (auth()→DB)"
    assert "session.organizationId" in src, "org must derive from the validated session"
    assert STUB_ORG not in src, "org must never be hardcoded in a mutation"


def test_protected_route_validates_session():
    src = AUDIT_ROUTE.read_text()
    assert "getSession(" in src, "protected route must validate the session (auth()→DB)"
    assert "401" in src, "protected route must 401 without a session"
    assert STUB_ORG not in src


def test_no_server_action_mutates_a_tenant_without_the_session():
    """Any 'use server' file that invokes a tenant mutation must validate the session first."""
    offenders = []
    for f in _app_ts_files():
        text = f.read_text(errors="ignore")
        if '"use server"' not in text:
            continue
        if any(m in text for m in TENANT_MUTATIONS):
            if "requireSession(" not in text and "getSession(" not in text:
                offenders.append(str(f.relative_to(ROOT)))
    assert not offenders, "tenant mutation without an authoritative session check:\n" + "\n".join(offenders)
