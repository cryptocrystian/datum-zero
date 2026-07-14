"""
Guardrail — the DoD test + the post-callback pipeline test + CI wiring must exist.

The DoD now drives a REAL upload through the composed containers (M2-7c): upload → queue → worker →
inference → callback → Anomaly. The fast in-process test honestly covers the POST-callback pipeline
(callback contract → bind → classify → QA → dispatch). Neither may be silently dropped, and CI must run
both — the host e2e suite (in-process) AND the composed real-trigger DoD (images job).

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSED = ROOT / "apps/web/e2e/composed-dod.composed.e2e.ts"
POSTCB = ROOT / "apps/web/e2e/post-callback-pipeline.e2e.ts"
RUNBOOK = ROOT / "docs/DEMO-RUNBOOK.md"
CI = ROOT / ".github/workflows/ci.yml"


def test_dod_artifacts_present():
    assert COMPOSED.exists(), "the real-trigger DoD (upload-driven, composed stack) is missing (M2-7c)"
    assert POSTCB.exists(), "the post-callback pipeline test is missing"
    assert RUNBOOK.exists(), "docs/DEMO-RUNBOOK.md is missing"


def test_real_dod_drives_the_upload_trigger():
    src = COMPOSED.read_text()
    assert "/api/v1/ingestion/upload" in src, "the DoD must POST a REAL upload (the trigger that was missing)"
    assert "processingStatus" in src, "the DoD must assert the session processes through the containers"
    assert "approveAnomaly" in src and "validateWorkOrder" in src, "the DoD must close the dispatch loop"


def test_post_callback_test_covers_the_pipeline():
    src = POSTCB.read_text()
    for stage in (
        "bindAirframe", "inferenceCallback", "spatialBindingStatus", "classification",
        "approveAnomaly", "getProvenance", "validateWorkOrder",
    ):
        assert stage in src, f"the post-callback pipeline must exercise '{stage}'"
    assert "createServer" in src, "external delivery targets are mocked in-process"


def test_ci_runs_both_dod_and_pipeline():
    ci = CI.read_text()
    assert "e2e:" in ci and "postgres:" in ci and "redis:" in ci, "the host e2e job needs Postgres + Redis"
    assert "prisma migrate deploy" in ci and "db:seed" in ci, "the e2e job must migrate + seed"
    assert "test:e2e" in ci, "CI must run the in-process e2e suite (incl. the post-callback pipeline)"
    assert "test:e2e:composed" in ci, "CI must run the real-trigger composed DoD (images job)"
