"""
Guardrails for M0-05 / CR-16 / DET-1c — inference creates UNBOUND anomalies with the MODEL classification.

Enforces:
  • CR-16 schema: Anomaly.assetId nullable + spatialBindingStatus {UNBOUND_REVIEW, BOUND}.
  • the inference callback persists the MEASUREMENT + MODEL-CLASSIFICATION layer (modelVersion +
    metrics + standardRef + classification; the model owns the type, CR-19) and creates the anomaly
    UNBOUND — but never writes the client-POLICY layer (recommendation/ruleSetId, applied later by the
    rules lib) and never forces an assetId at creation (binding is M0-06).

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "packages/db/prisma/schema.prisma"
CALLBACK = ROOT / "apps/web/app/api/v1/inference/callback/route.ts"


def test_cr16_schema_anomaly_unbound():
    schema = SCHEMA.read_text()
    assert re.search(r"assetId\s+String\?", schema), "CR-16: Anomaly.assetId must be nullable"
    assert re.search(
        r"enum\s+SpatialBindingStatus\s*\{[^}]*UNBOUND_REVIEW[^}]*BOUND[^}]*\}", schema, re.S
    ), "CR-16: SpatialBindingStatus enum {UNBOUND_REVIEW, BOUND} must exist"
    assert re.search(
        r"spatialBindingStatus\s+SpatialBindingStatus\s+@default\(UNBOUND_REVIEW\)", schema
    ), "CR-16: spatialBindingStatus must default to UNBOUND_REVIEW"


def test_callback_creates_unbound_with_model_version():
    src = CALLBACK.read_text()
    assert CALLBACK.exists(), "inference callback route missing (M0-05)"
    assert "UNBOUND_REVIEW" in src, "callback must create anomalies UNBOUND_REVIEW (CR-16)"
    assert "modelVersion" in src, "callback must record modelVersion (audit trail, CR-12)"
    # Tenant-scoped session lookup (multi-tenant native).
    assert "organizationId" in src, "callback must be org-scoped"


def test_callback_persists_model_classification():
    """DET-1c: the model owns the type — the callback persists classification + standardRef (CR-19)."""
    src = CALLBACK.read_text()
    assert "d.classification" in src and "d.standard_ref" in src, "callback must read the model classification"
    assert "classification," in src and "standardRef:" in src, "callback must persist the model classification"


def test_callback_does_not_write_the_policy_layer():
    """The client-POLICY layer (recommendation/ruleSetId) is applied by the rules lib, NOT the callback (CR-12)."""
    src = CALLBACK.read_text()
    forbidden = ["recommendation:", "ruleSetId:"]
    offenders = [tok for tok in forbidden if tok in src]
    assert not offenders, (
        "inference callback must not write the policy layer (rules lib owns priority/recommendation/routing); "
        f"found: {offenders}"
    )
    # Binding is M0-06: the callback must not force an assetId at creation.
    assert "assetId:" not in src, "callback must leave assetId unset (binding is M0-06, CR-16)"
