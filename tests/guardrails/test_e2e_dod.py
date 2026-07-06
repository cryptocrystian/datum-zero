"""
Guardrail for M0-12 — the end-to-end DoD test, runbook, and CI wiring must exist.

The walking-skeleton Definition-of-Done path is the closing acceptance test; it must not be
silently dropped, and CI must run it against real Postgres + Redis.

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
E2E = ROOT / "apps/web/e2e/dod.e2e.ts"
RUNBOOK = ROOT / "docs/DEMO-RUNBOOK.md"
CI = ROOT / ".github/workflows/ci.yml"


def test_dod_artifacts_present():
    assert E2E.exists(), "the DoD end-to-end test is missing (M0-12)"
    assert RUNBOOK.exists(), "docs/DEMO-RUNBOOK.md is missing (M0-12)"


def test_e2e_covers_the_full_path():
    src = E2E.read_text()
    for stage in ("bindAirframe", "inferenceCallback", "spatialBindingStatus", "classification", "approveAnomaly", "getProvenance", "validateWorkOrder"):
        assert stage in src, f"e2e must exercise '{stage}'"
    # External HTTP is mocked (no live Jira/webhook in CI).
    assert "createServer" in src, "e2e must mock the delivery targets in-process"


def test_ci_runs_e2e_with_services():
    ci = CI.read_text()
    assert "e2e:" in ci, "CI must define an e2e job"
    assert "postgres:" in ci and "redis:" in ci, "e2e job needs Postgres + Redis service containers"
    assert "prisma migrate deploy" in ci, "e2e job must migrate the schema"
    assert "db:seed" in ci, "e2e job must seed"
    assert "test:e2e" in ci, "e2e job must run the DoD test"
