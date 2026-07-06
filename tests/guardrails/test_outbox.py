"""
Guardrails for M0-09 — the rate-limited, idempotent generic-webhook outbox (CR-05, CR-12).

Asserts the resilient-delivery invariants at the source level:
  • payloads are validated against the JSON Schema before sending (creation AND worker);
  • delivery is idempotent (idempotencyKey) and rate-limited (≤5/s per org);
  • 5xx/network is retryable, hard client rejections are not;
  • the render NEVER emits a null recommendation (bound-but-unclassified fallback);
  • adapters sit behind a registry (only GENERIC_WEBHOOK implemented now — Jira is M0-10).

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DISPATCH = ROOT / "apps/web/lib/outbox/dispatch.ts"
WORKER = ROOT / "apps/web/lib/outbox/worker.ts"
QUEUE = ROOT / "apps/web/lib/outbox/queue.ts"
RENDER = ROOT / "packages/adapters/src/render.ts"
REGISTRY = ROOT / "packages/adapters/src/registry.ts"


def test_outbox_files_present():
    for f in (DISPATCH, WORKER, QUEUE, RENDER, REGISTRY):
        assert f.exists(), f"missing outbox file: {f}"


def test_payload_validated_before_send():
    # Validated at creation (dispatch) and again before the actual POST (worker).
    assert "validateWorkOrder(" in DISPATCH.read_text(), "dispatch must validate the payload at creation"
    assert "validateWorkOrder(" in WORKER.read_text(), "worker must validate the payload before sending"


def test_delivery_is_idempotent():
    d = DISPATCH.read_text()
    q = QUEUE.read_text()
    assert "idempotencyKey" in d, "dispatch must key WorkOrderDispatch by idempotencyKey"
    assert "upsert" in d, "re-dispatch must be idempotent (upsert, not duplicate)"
    assert "jobId: dispatchId" in q, "enqueue must dedupe by a stable jobId (deterministic dispatchId)"


def test_worker_rate_limits_and_retries():
    w = WORKER.read_text()
    assert "organizationId" in w, "rate limit must be keyed per org token (≤5/s)"
    assert "RATE_MAX" in w and "5" in w, "worker must enforce a ≤5/s budget"
    assert "isResolved" in w and "downstreamRef" in w, "worker must record resolution + downstream ref"
    assert "retryable" in w, "5xx/network must retry; hard rejections must not"


def test_recommendation_is_never_null():
    r = RENDER.read_text()
    assert "fallbackRecommendation" in r, "bound-but-unclassified must still get an evidence recommendation"
    assert "?? fallbackRecommendation" in r, "recommendation text must never be null"
    assert "review recommended" in r, "fallback must be evidence-framed"


def test_adapter_registry_generic_webhook_only():
    reg = REGISTRY.read_text()
    assert "genericWebhookAdapter" in reg, "generic webhook must be registered"
    # Jira is M0-10 — its ADAPTER must not be wired yet (a comment referencing it is fine).
    assert "jiraAdapter" not in reg, "Jira adapter is M0-10, not M0-09"
