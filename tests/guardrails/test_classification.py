"""
Guardrails for M0-07 — tolerance eval + IEC TS 62446-3 classification (CR-12, CR-15).

Enforces:
  • only BOUND anomalies are classified (fail closed — unbound is never classified/dispatched);
  • classification NEVER advances the queue: it must not touch `status` (stays PENDING_QA) and must
    not reference a dispatch state;
  • the classifier is org-scoped and standards-anchored (standardRef);
  • the recommendation stays evidence-framed ("Review recommended vs. <standard>").

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLASSIFY = ROOT / "apps/web/lib/rules/classify.ts"
EVAL = ROOT / "apps/web/lib/rules/tolerance-eval.ts"


def test_rules_files_present():
    assert CLASSIFY.exists(), "classify orchestration missing (M0-07)"
    assert EVAL.exists(), "tolerance-eval generator missing (M0-07)"


def test_classification_only_binds_bound_anomalies():
    src = CLASSIFY.read_text()
    assert "SpatialBindingStatus.BOUND" in src, "only BOUND anomalies may be classified (fail closed)"
    assert src.count("organizationId") >= 3, "classification queries must be organizationId-scoped"


def test_classification_never_advances_status():
    """status stays PENDING_QA — classification must not mutate status or move toward dispatch (CR-12)."""
    src = CLASSIFY.read_text()
    assert "status:" not in src, "classify must not write `status` — it stays PENDING_QA (CR-12)"
    assert "APPROVED_DISPATCHED" not in src, "classification must never dispatch (CR-12)"


def test_recommendation_is_standards_anchored_and_evidence_framed():
    src = EVAL.read_text()
    assert "Review recommended vs." in src, "recommendation must use evidence-framed review language (CR-12)"
    assert "IEC TS 62446-3" in src, "classification must be anchored to the standard (CR-15)"
