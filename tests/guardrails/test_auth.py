"""
Guardrails for M1-01 — real authentication (CR-20).

  • the M0 stub reviewer identity no longer exists anywhere;
  • the session is derived from the real Auth.js session, not a hardcoded org id;
  • no cockpit page / protected API route is reachable without a session (middleware gate +
    authoritative layout/route checks);
  • no self-serve signup — users are concierge-provisioned (CR-14).

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
SESSION = WEB / "lib/session.ts"
AUTH = WEB / "auth.ts"
MIDDLEWARE = WEB / "middleware.ts"
LAYOUT = WEB / "app/(cockpit)/layout.tsx"
AUDIT_ROUTE = WEB / "app/api/v1/audit/provenance/[dispatchId]/route.ts"

STUB_ORG = "00000000-0000-0000-0000-000000000001"


def _sources():
    for f in list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx")):
        if "node_modules" in f.parts or ".next" in f.parts:
            continue
        yield f


def test_no_stub_reviewer_identity_anywhere():
    offenders = [str(f.relative_to(ROOT)) for f in _sources() if "stub-qa-reviewer" in f.read_text(errors="ignore")]
    assert not offenders, "the stub reviewer identity must be gone:\n" + "\n".join(offenders)


def test_session_is_real_and_not_hardcoded():
    src = SESSION.read_text()
    assert "auth()" in src, "session must derive from the real auth() session"
    assert "STUB_ORG_ID" not in src, "the stub org constant must be gone"
    assert STUB_ORG not in src, "the tenant must come from the session, never a hardcoded org id"
    # the thin interface is preserved so callers don't change shape
    assert "getCurrentOrgId" in src and "getCurrentReviewer" in src


def test_middleware_gates_routes():
    src = MIDDLEWARE.read_text()
    assert "matcher" in src, "middleware must define a matcher"
    assert "401" in src, "protected API must 401 without a session"
    assert "redirect" in src.lower(), "protected pages must redirect without a session"


def test_cockpit_layout_requires_real_session():
    src = LAYOUT.read_text()
    assert "getSession" in src and "redirect(" in src, "cockpit layout must gate on a real session (authoritative)"


def test_audit_route_requires_session():
    src = AUDIT_ROUTE.read_text()
    assert "getSession" in src and "401" in src, "protected API route must reject unauthenticated requests"


def test_no_self_serve_signup():
    src = AUTH.read_text()
    assert "createUser" in src and "concierge" in src.lower(), "adapter must refuse self-serve user creation (CR-14)"
    assert 'strategy: "database"' in src, "sessions must be persisted in Postgres (database strategy)"
