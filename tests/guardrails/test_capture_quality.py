"""
Guardrail — CaptureQualityEvent is a fail-closed record with NO dispatch path (M2-1d, CR-11/22/25).

Static assertions (the root guardrail interpreter has no app deps):
  • the model exists, is org-scoped, and is DISTINCT from Anomaly — no relation to WorkOrderDispatch,
    no anomaly/workOrder field → a data-quality event can never become a work order (fail closed);
  • the new migration RLS-enables + FORCEs + policies the table (tenant isolation, CR-20);
  • the capture-quality callback + lib create no Anomaly and no WorkOrderDispatch and never dispatch;
  • operator/edge copy is evidence-framed — no verdict language (CR-12).

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = (ROOT / "packages/db/prisma/schema.prisma").read_text()
MIGRATIONS = ROOT / "packages/db/prisma/migrations"
ROUTE = (ROOT / "apps/web/app/api/v1/inference/capture-quality/route.ts").read_text()
EVENTS = (ROOT / "apps/web/lib/quality/events.ts").read_text()
REASON = (ROOT / "apps/web/lib/quality/reason.ts").read_text()
STRIP = (ROOT / "apps/web/app/(cockpit)/queue/CaptureQualityStrip.tsx").read_text()
AGG = (ROOT / "apps/web/app/(cockpit)/queue/UnsupportedFormats.tsx").read_text()

VERDICT_WORDS = ("violation", "breach", "back-charge", "penalty", "liable", "enforce")


def _model_block(name: str) -> str:
    m = re.search(rf"model {name} \{{(.*?)\n\}}", SCHEMA, re.S)
    assert m, f"model {name} not found in schema.prisma"
    return m.group(1)


def test_capture_quality_event_model_exists_and_is_org_scoped():
    block = _model_block("CaptureQualityEvent")
    assert "organizationId" in block, "CaptureQualityEvent must be org-scoped (multi-tenant native)"
    assert "ingestionSessionId" in block, "must be session-scoped"
    for field in ("status", "reason", "createdAt"):
        assert field in block, f"CaptureQualityEvent must carry {field}"


def test_capture_quality_event_has_no_dispatch_path():
    block = _model_block("CaptureQualityEvent")
    # No relation to the dispatch/anomaly graph — the fail-closed guarantee is structural.
    for banned in ("WorkOrderDispatch", "Anomaly", "workOrder", "anomaly", "dispatch"):
        assert banned not in block, f"CaptureQualityEvent must NOT relate to {banned!r} (no dispatch path — CR-25)"
    # And the dispatch table must not gain a reverse link to it.
    assert "CaptureQualityEvent" not in _model_block("WorkOrderDispatch"), \
        "WorkOrderDispatch must not reference CaptureQualityEvent"


def test_migration_enables_rls_on_capture_quality_event():
    sql = ""
    for d in MIGRATIONS.iterdir():
        f = d / "migration.sql"
        if f.exists() and "CaptureQualityEvent" in f.read_text() and 'CREATE TABLE "CaptureQualityEvent"' in f.read_text():
            sql = f.read_text()
            break
    assert sql, "no migration creates CaptureQualityEvent"
    assert 'ALTER TABLE "CaptureQualityEvent" ENABLE ROW LEVEL SECURITY' in sql
    assert 'ALTER TABLE "CaptureQualityEvent" FORCE  ROW LEVEL SECURITY' in sql
    assert "app_current_org()" in sql, "tenant-isolation policy must key on the app.current_org GUC (CR-20)"


def test_callback_and_lib_never_create_an_anomaly_or_dispatch():
    # Code-access tokens only — comments may legitimately describe what the path does NOT do.
    for src, name in ((ROUTE, "route"), (EVENTS, "events")):
        assert "prisma.anomaly" not in src, f"{name}: capture-quality path must not touch the anomaly table"
        assert "prisma.workOrderDispatch" not in src, \
            f"{name}: capture-quality path must not create a dispatch (fail closed)"
        assert "dispatchAnomaly" not in src, f"{name}: capture-quality path must not dispatch"


def test_capture_quality_copy_is_evidence_framed():
    for src, name in ((REASON, "reason"), (STRIP, "strip"), (ROUTE, "route"), (AGG, "unsupported-formats")):
        low = src.lower()
        for w in VERDICT_WORDS:
            assert w not in low, f"{name}: verdict word {w!r} in capture-quality copy (CR-12)"


def test_unsupported_format_aggregate_is_unknown_only_and_org_scoped():
    # The demand signal counts UNKNOWN_FORMAT (coverage gaps) — NOT colorized captures — grouped by
    # device + fingerprint, org-scoped (M2-1f, CR-11/CR-22/CR-26).
    assert "listUnsupportedFormatCounts" in EVENTS, "the unsupported-format aggregate must exist"
    assert 'status: "UNKNOWN_FORMAT"' in EVENTS, "the aggregate must count UNKNOWN_FORMAT, not NO_RADIOMETRIC_CHANNEL"
    assert "organizationId" in EVENTS, "the aggregate must be org-scoped (multi-tenant native)"
    assert 'by: ["manufacturer", "model", "formatFingerprint"]' in EVENTS, "must group by device + fingerprint"


def test_audit_provenance_surfaces_detected_format():
    # M2-1e/CR-27: the audit readback must reconstruct which decoder produced the measurement.
    prov = (ROOT / "apps/web/lib/audit/provenance.ts").read_text()
    assert "detectedFormat" in prov, "audit provenance must surface the detected radiometric format (CR-27)"


def test_radiometric_dod_and_failclosed_e2e_exist():
    # The radiometric-provenance assertion lives in the post-callback pipeline test (renamed from
    # dod.e2e.ts in M2-7c; the real upload-driven DoD is composed-dod.composed.e2e.ts).
    dod = (ROOT / "apps/web/e2e/post-callback-pipeline.e2e.ts").read_text()
    assert "chain.source.detectedFormat" in dod, "the pipeline e2e must assert radiometric provenance (M2-1e)"
    assert (ROOT / "apps/web/e2e/capture-quality.e2e.ts").exists(), \
        "the fail-closed capture-quality DoD e2e must exist (M2-1d/f)"
