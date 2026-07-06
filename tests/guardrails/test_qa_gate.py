"""
Guardrails for M0-08 — the server-enforced 100% QA gate (CR-12).

Dispatch is IMPOSSIBLE without a recorded human approval. These tests assert:
  • the gate exists and THROWS (not warns) when there is no reviewer / not APPROVED_DISPATCHED;
  • the single dispatch entry point invokes the gate before proceeding;
  • no code path in the web app creates a WorkOrderDispatch outside the guarded outbox module;
  • the approve action stamps the reviewer + status but never itself dispatches.

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
GATE = WEB / "lib/outbox/gate.ts"
DISPATCH = WEB / "lib/outbox/dispatch.ts"
REVIEW = WEB / "lib/qa/review.ts"


def test_qa_gate_present_and_throws():
    assert GATE.exists(), "dispatch gate module missing (M0-08)"
    src = GATE.read_text()
    assert "assertApprovedForDispatch" in src
    assert "reviewedById" in src, "gate must require a recorded reviewer"
    assert "APPROVED_DISPATCHED" in src, "gate must require an approved status"
    assert "throw new DispatchGateError" in src, "gate must FAIL CLOSED (throw), never warn"


def test_dispatch_entrypoint_enforces_gate():
    assert DISPATCH.exists(), "dispatch entry point missing (M0-08)"
    src = DISPATCH.read_text()
    assert "assertApprovedForDispatch(" in src, "dispatch must invoke the QA gate before proceeding"


def test_no_dispatch_path_bypasses_the_gate():
    """Any WorkOrderDispatch creation must live in the guarded outbox module (future-proofs M0-09)."""
    allowed = DISPATCH.resolve()
    offenders = []
    for f in list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx")):
        if "node_modules" in f.parts or ".next" in f.parts:
            continue
        if "workOrderDispatch.create" in f.read_text(errors="ignore") and f.resolve() != allowed:
            offenders.append(str(f.relative_to(ROOT)))
    assert not offenders, "WorkOrderDispatch created outside the guarded outbox:\n" + "\n".join(offenders)


def test_approve_stamps_reviewer_and_never_dispatches():
    src = REVIEW.read_text()
    for token in ("APPROVED_DISPATCHED", "reviewedById", "reviewedAt"):
        assert token in src, f"approve must record {token} (CR-12 audit trail)"
    # Approve must not itself dispatch — that is the guarded outbox (M0-09).
    assert "dispatchAnomaly" not in src, "the QA service must not call dispatch — M0-09 owns that"
    assert "workOrderDispatch" not in src, "the QA service must not create dispatch rows"
