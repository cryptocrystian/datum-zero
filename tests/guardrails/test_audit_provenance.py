"""
Guardrail for M0-11 — audit provenance readback (CR-12).

A determination must be fully reconstructable in ONE org-scoped call. These tests assert the
provenance query is tenant-scoped and selects every link of the chain (source image, model +
metrics, the rule hit, reviewer, timestamps, downstream ref).

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROVENANCE = ROOT / "apps/web/lib/audit/provenance.ts"
ROUTE = ROOT / "apps/web/app/api/v1/audit/provenance/[dispatchId]/route.ts"


def test_provenance_module_present():
    assert PROVENANCE.exists(), "provenance module missing (M0-11)"
    assert ROUTE.exists(), "provenance API route missing (M0-11)"


def test_provenance_is_one_call_and_org_scoped():
    src = PROVENANCE.read_text()
    # Single query...
    assert "workOrderDispatch.findFirst" in src, "provenance must resolve in one query"
    # ...org-scoped (multi-tenant native, fail closed on wrong org).
    assert "organizationId" in src, "provenance query must be organizationId-scoped"
    assert "id: dispatchId, organizationId" in src, "query must key on (dispatchId, organizationId)"
    assert "getProvenance" in src


def test_provenance_reconstructs_the_full_chain():
    src = PROVENANCE.read_text()
    required = [
        "fullStoragePath",   # source image
        "modelVersion",      # model
        "confidenceScore",   # metrics
        "ruleSet",           # the rule hit
        "standardRef",       # standard
        "classification",    # classification
        "reviewedById",      # reviewer
        "reviewedAt",        # reviewer timestamp
        "downstreamRef",     # delivery ref
        "capturedAt",        # capture timestamp
        "ingestionSession",  # source provenance
    ]
    for field in required:
        assert field in src, f"provenance chain must include '{field}' (CR-12 reconstructability)"


def test_route_is_org_scoped():
    src = ROUTE.read_text()
    # Org scope derives from the authenticated session (M1-01/CR-20), not a hardcoded/stub id.
    assert "getSession(" in src, "audit route must derive the org from the authenticated session"
    assert "session.organizationId" in src, "provenance must be scoped to the session's tenant"
    assert "getProvenance(" in src
