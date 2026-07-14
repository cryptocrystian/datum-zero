"""
Guardrails for M2-7 — ingestion→inference orchestration (CR-36).

The trigger that was missing: upload ENQUEUES a `session-inference` job; the worker HTTP-calls the
inference service; idempotent, retried, and FAIL CLOSED with a VISIBLE `FAILED` state. A capture must
NEVER vanish into the queue.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
UPLOAD = WEB / "app/api/v1/ingestion/upload/route.ts"
QUEUE = WEB / "lib/ingestion/inference-queue.ts"
WORKER = WEB / "lib/ingestion/inference-worker.ts"
WORKER_MAIN = WEB / "lib/outbox/worker-main.ts"
SESSIONS = WEB / "lib/ingestion/sessions.ts"
QUEUE_PAGE = WEB / "app/(cockpit)/queue/page.tsx"


def test_upload_enqueues_inference_after_session_create():
    src = UPLOAD.read_text()
    assert "enqueueSessionInference" in src, "upload must enqueue the inference job (the missing trigger)"
    create = src.rfind("ingestionSession.create")  # the success-path create is the last one
    call = src.rfind("await enqueueSessionInference(")
    assert call > create, "enqueue must run AFTER the session is committed"


def test_critical_missing_metadata_never_enqueues():
    """The M2-3a Part D fail-closed gate must precede + return before any enqueue (a critical-missing
    capture is never processed)."""
    src = UPLOAD.read_text()
    part_d = src.find("INCOMPLETE_CAPTURE_METADATA")
    call = src.rfind("await enqueueSessionInference(")
    assert part_d != -1 and call != -1 and part_d < call, "the fail-closed gate must precede enqueue"
    assert src.count("await enqueueSessionInference(") == 1, "enqueue only on the success path"


def test_worker_reaches_a_terminal_state_no_stuck_session():
    src = WORKER.read_text()
    for state in ('"PROCESSING"', '"COMPLETE"', '"FAILED"'):
        assert state in src, f"worker must write {state} — every processed session reaches a terminal state"
    # FAILED is gated on exhausted retries (the last attempt), tied to the BullMQ attempt count.
    assert "attemptsMade" in src and "attempts" in src, "FAILED must be fail-closed on exhausted retries"


def test_worker_is_idempotent():
    assert re.search(r'processingStatus\s*===\s*"COMPLETE"', WORKER.read_text()), \
        "worker must skip an already-COMPLETE session (no duplicate anomalies on replay)"


def test_inference_worker_runs_in_the_worker_process():
    assert "startInferenceWorker" in WORKER_MAIN.read_text(), "the workers process must start the inference worker"


def test_failed_sessions_are_surfaced_to_the_operator():
    assert re.search(r'processingStatus:\s*"FAILED"', SESSIONS.read_text()), "a query must surface FAILED sessions"
    page = QUEUE_PAGE.read_text()
    assert "listFailedInferenceSessions" in page and "ProcessingFailures" in page, \
        "the cockpit must render inference failures (never silently dropped)"


def test_trigger_is_queue_based_not_a_direct_call():
    assert "session-inference" in QUEUE.read_text(), "orchestration is a BullMQ queue (retry/idempotency/backpressure)"
    assert "/internal/process" not in UPLOAD.read_text(), "upload must not call inference directly — it enqueues"
    assert "/internal/process" in WORKER.read_text(), "the worker is what HTTP-calls inference"
