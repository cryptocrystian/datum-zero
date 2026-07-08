"""
Guardrails for OPS-4 — admin user management (CR-14, CR-20). HIGHEST-RISK SURFACE.

The auth substrate (User/Account/Session/VerificationToken) is RLS-EXEMPT (M1-02): the DB will NOT
backstop a missed tenant filter, so a forgotten organizationId here is a real cross-tenant leak. The
headline guardrail asserts EVERY prisma.user query in the management lib is organizationId-scoped and
that no unique-key op (findUnique/update/delete) — which would bypass the org scope — is used.

Also enforces: ADMIN-only surface (REVIEWER/PILOT cannot reach it) through the authenticated DAL; the
self-lockout + last-active-ADMIN safety rails; deactivation blocks the next sign-in.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADMIN = ROOT / "apps/web/lib/users/admin.ts"
ACTIONS = ROOT / "apps/web/app/(cockpit)/users/actions.ts"
PAGE = ROOT / "apps/web/app/(cockpit)/users/page.tsx"
AUTH_CORE = ROOT / "apps/web/lib/auth-core.ts"
AUTH = ROOT / "apps/web/auth.ts"


def test_files_present():
    for f in (ADMIN, ACTIONS, PAGE, AUTH_CORE, AUTH):
        assert f.exists(), f"missing {f.name}"


def test_every_user_query_is_org_scoped():
    """RLS-EXEMPT surface: every prisma.user.* call must carry organizationId (the DB won't catch a miss)."""
    src = ADMIN.read_text()
    offenders = []
    for m in re.finditer(r"prisma\.user\.\w+", src):
        window = src[m.start():m.start() + 240]  # the call spans a couple of lines
        if "organizationId" not in window:
            offenders.append(src[m.start():m.start() + 80].splitlines()[0])
    assert not offenders, "prisma.user query without organizationId (cross-tenant leak risk):\n" + "\n".join(offenders)


def test_no_unique_key_user_ops_that_bypass_org_scope():
    """findUnique/update/delete key on a unique field only — they cannot carry the org filter. Banned here."""
    src = ADMIN.read_text()
    for banned in ("prisma.user.findUnique", "prisma.user.update(", "prisma.user.delete("):
        assert banned not in src, f"{banned} bypasses org scoping — use findFirst/updateMany/deleteMany"
    assert "RLS-EXEMPT" in src or "RLS-exempt" in src, "the surface must document that the DB does not backstop the org filter"


def test_surface_is_admin_only_through_the_dal():
    a = ACTIONS.read_text()
    assert a.lstrip().startswith('"use server"')
    assert 'role !== "ADMIN"' in a, "user management mutations must be ADMIN-only"
    assert a.count("requireAdmin") >= 3, "create/update/delete each pass the ADMIN gate"
    assert "requireSession" in a and "runWithOrg" in a
    p = PAGE.read_text()
    assert 'session.role !== "ADMIN"' in p and "redirect" in p, "the page must redirect REVIEWER/PILOT out (ADMIN-only, not read-only)"


def test_safety_rails_present():
    src = ADMIN.read_text()
    assert "actingUserId" in src, "self-action rails need the acting user's id"
    assert re.search(r"cannot (deactivate|delete) yourself", src, re.I), "must block self deactivate/delete (no lockout)"
    assert "otherActiveAdminCount" in src and re.search(r"last active ADMIN", src), "must block removing the last active ADMIN"
    assert "reviewedById" in src, "delete must preserve the audit trail (reviewer references, CR-12)"


def test_deactivation_blocks_sign_in():
    core = AUTH_CORE.read_text()
    assert "isEligibleForSignIn" in core and "isActive" in core, "sign-in eligibility must check isActive (deactivation)"
    auth = AUTH.read_text()
    assert "isEligibleForSignIn" in auth, "the signIn callback must delegate to the eligibility check"
