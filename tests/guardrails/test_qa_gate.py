"""
Guardrails for the server-enforced 100% QA gate (CR-12) — M0-08 gate, M0-09 dispatch.

Dispatch is IMPOSSIBLE without a recorded human approval. These tests assert:
  • the gate exists and THROWS (not warns) when there is no reviewer / not APPROVED_DISPATCHED;
  • the single dispatch entry point invokes the gate BEFORE creating any WorkOrderDispatch;
  • no code path in the web app writes a WorkOrderDispatch outside the guarded outbox module;
  • approve dispatches ONLY through the guarded entry point (never creating dispatch rows itself).

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
GATE = WEB / "lib/outbox/gate.ts"
DISPATCH = WEB / "lib/outbox/dispatch.ts"
REVIEW = WEB / "lib/qa/review.ts"

# Any Prisma write to the WorkOrderDispatch model.
WOD_WRITE = re.compile(r"workOrderDispatch\.(create|createMany|upsert)")


def test_qa_gate_present_and_throws():
    assert GATE.exists(), "dispatch gate module missing"
    src = GATE.read_text()
    assert "assertApprovedForDispatch" in src
    assert "reviewedById" in src, "gate must require a recorded reviewer"
    assert "APPROVED_DISPATCHED" in src, "gate must require an approved status"
    assert "throw new DispatchGateError" in src, "gate must FAIL CLOSED (throw), never warn"


def test_dispatch_enforces_gate_before_creating_rows():
    assert DISPATCH.exists(), "dispatch entry point missing"
    src = DISPATCH.read_text()
    guard = src.find("assertApprovedForDispatch(")
    write = WOD_WRITE.search(src)
    assert guard != -1, "dispatch must invoke the QA gate"
    assert write is not None, "M0-09 dispatch must persist a WorkOrderDispatch"
    assert guard < write.start(), "the QA gate must run BEFORE any WorkOrderDispatch is created (CR-12)"


def test_no_dispatch_path_bypasses_the_gate():
    """Every WorkOrderDispatch write must live in the guarded outbox module."""
    allowed = DISPATCH.resolve()
    offenders = []
    for f in list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx")):
        if "node_modules" in f.parts or ".next" in f.parts:
            continue
        if WOD_WRITE.search(f.read_text(errors="ignore")) and f.resolve() != allowed:
            offenders.append(str(f.relative_to(ROOT)))
    assert not offenders, "WorkOrderDispatch written outside the guarded outbox:\n" + "\n".join(offenders)


def test_approve_dispatches_only_via_guarded_entrypoint():
    src = REVIEW.read_text()
    for token in ("APPROVED_DISPATCHED", "reviewedById", "reviewedAt"):
        assert token in src, f"approve must record {token} (CR-12 audit trail)"
    # Approve dispatches THROUGH the guarded entry point (the gate re-runs there)...
    assert "dispatchAnomaly(" in src, "approve must dispatch via the guarded entry point (M0-09)"
    # ...but must never create dispatch rows itself — only the guarded outbox may.
    assert not WOD_WRITE.search(src), "approve must not write WorkOrderDispatch directly"
