"""
Guardrails for DET-1c — model-owned classification + RuleSet as client policy (CR-12, CR-15 amend, CR-19).

Enforces:
  • the anomaly TYPE originates from the MODEL payload — the callback persists `classification` +
    `standard_ref` as the authority (CR-19); the RuleSet policy must NOT overwrite them;
  • the RuleSet no longer derives the type from a ΔT cutoff — it applies the client's POLICY
    (priority + routeTargets + recommendation) over the model classification;
  • only BOUND anomalies get policy (fail closed) and policy NEVER advances `status` (stays PENDING_QA);
  • the recommendation stays evidence-framed ("Review recommended vs. <standard>") — no verdict language.

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLASSIFY = ROOT / "apps/web/lib/rules/classify.ts"
EVAL = ROOT / "apps/web/lib/rules/tolerance-eval.ts"
ROUTE = ROOT / "apps/web/app/api/v1/inference/callback/route.ts"

# Verdict language is a HARD STOP in any client-facing output (CR-12).
VERDICT_WORDS = ("violation", "breach", "back-charge", "penalty", "liable")


def test_rules_and_callback_files_present():
    assert CLASSIFY.exists(), "policy orchestration missing (classify.ts)"
    assert EVAL.exists(), "policy generator missing (tolerance-eval.ts)"
    assert ROUTE.exists(), "inference callback missing (route.ts)"


def test_classification_originates_from_the_model_payload():
    """The MODEL owns the type (CR-19): the callback persists classification + standard_ref."""
    src = ROUTE.read_text()
    assert "d.classification" in src, "callback must read the model classification from the payload"
    assert "d.standard_ref" in src, "callback must read the model standard_ref from the payload"
    assert "classification," in src and "standardRef:" in src, "callback must persist them on the anomaly"


def test_ruleset_no_longer_derives_type_from_delta():
    """CR-15 amend: RuleSet is client POLICY, not a ΔT→type cutoff."""
    src = EVAL.read_text()
    assert "classifyDelta" not in src, "ΔT→type derivation must be removed (the model owns the type)"
    assert "applyPolicy" in src, "the RuleSet must apply a client policy"
    assert "routeTargets" in src, "policy carries the client's routing"
    assert "priority" in src.lower(), "policy combines class + ΔT into a priority"


def test_policy_does_not_overwrite_the_model_classification():
    """The policy step sets priority/recommendation/ruleSetId — never the model's type (CR-19)."""
    src = CLASSIFY.read_text()
    assert "classification: result" not in src, "policy must not overwrite the model classification"
    assert "standardRef: result" not in src, "policy must not overwrite the model standardRef"
    assert "priority: result.priority" in src, "policy sets the maintenance priority"


def test_policy_is_bound_only_and_org_scoped():
    src = CLASSIFY.read_text()
    assert "SpatialBindingStatus.BOUND" in src, "only BOUND anomalies get policy (fail closed)"
    assert src.count("organizationId") >= 3, "policy queries must be organizationId-scoped"


def test_policy_never_advances_status():
    """status stays PENDING_QA — policy must not mutate status or move toward dispatch (CR-12)."""
    src = CLASSIFY.read_text()
    assert "status:" not in src, "policy must not write `status` — it stays PENDING_QA (CR-12)"
    assert "APPROVED_DISPATCHED" not in src, "policy must never dispatch (CR-12)"


def test_recommendation_is_evidence_framed_and_verdict_free():
    src = EVAL.read_text()
    assert "Review recommended vs." in src, "recommendation must use evidence-framed review language (CR-12)"
    low = src.lower()
    for word in VERDICT_WORDS:
        assert word not in low, f"tolerance-eval must stay evidence-framed — found verdict word {word!r}"
