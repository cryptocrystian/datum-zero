"""
Guardrails for M1-06 — hardware screening + fail-closed upload (CR-11).

Asserts:
  • a FAIL'd (non-eligible) frame can NEVER upload — the client-side gate;
  • uploads go ONLY through the authenticated ingestion endpoint; the field APIs are session-authed;
  • the NDAA screen is a documented HEURISTIC (WARN), explicitly NOT an attestation;
  • no CR-11-prohibited CLAIMS in the field hardware/upload copy.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
VALIDATION = WEB / "lib/field/validation.ts"
UPLOAD_HOOK = WEB / "app/field/useFieldUpload.ts"
WORKER = WEB / "app/field/validation.worker.ts"
AIRFRAME_ROUTE = WEB / "app/api/v1/field/airframe/route.ts"
INGEST_ROUTE = WEB / "app/api/v1/ingestion/upload/route.ts"
COPY_FILES = [
    VALIDATION,
    UPLOAD_HOOK,
    WORKER,
    AIRFRAME_ROUTE,
    WEB / "app/field/ValidationResults.tsx",
    WEB / "app/field/FileIntake.tsx",
]

PROHIBITED = [
    re.compile(r"live\s+remote[\s-]?id", re.I),
    re.compile(r"remote[\s-]?id\s+(?:verif|captur|broadcast|attest|scan|receiv)", re.I),
    re.compile(r"(?:verif|captur|broadcast|attest|receiv)\w*\s+(?:the\s+|a\s+)?remote[\s-]?id", re.I),
    re.compile(r"\bndaa\b[\s\S]{0,25}attest", re.I),
    re.compile(r"attest\w*[\s\S]{0,25}\bndaa\b", re.I),
    re.compile(r"in[\s-]?browser[\s\S]{0,40}attest", re.I),
]
VERDICT = re.compile(r"\b(violation|breach|back[- ]?charge|penalty|liable|guilty)\b", re.I)


def test_failed_frames_can_never_upload():
    v = VALIDATION.read_text()
    # a frame is upload-eligible only when NO check FAILs (fail closed)
    assert 'uploadEligible: status !== "FAIL"' in v, "eligibility must require no FAIL in any check"
    hook = UPLOAD_HOOK.read_text()
    assert "uploadEligible" in hook, "the upload gate must consult the screening eligibility flag"
    assert "SKIPPED" in hook, "a non-eligible frame must be skipped, never uploaded"


def test_uploads_only_through_the_authenticated_endpoint():
    urls = re.findall(r"""fetch\(\s*["'`]([^"'`]+)""", UPLOAD_HOOK.read_text())
    assert urls, "the upload hook must POST somewhere"
    for u in urls:
        assert u.startswith("/api/v1/ingestion/upload"), f"field upload must go only through the ingestion endpoint, not {u}"
    # the ingestion endpoint accepts the authenticated pilot session; the airframe screen is org-scoped
    assert "getSession" in INGEST_ROUTE.read_text(), "ingestion must accept the authenticated session"
    ar = AIRFRAME_ROUTE.read_text()
    assert "getSession" in ar and "runWithOrg" in ar, "the airframe screen must be session-authed + org-scoped (RLS)"


def test_server_side_bind_is_authoritative_and_fails_closed():
    src = INGEST_ROUTE.read_text()
    assert "bindAirframe" in src, "ingestion must perform the authoritative airframe bind"
    assert "422" in src, "ingestion must fail closed (422) on an unverified airframe"


def test_ndaa_screen_is_documented_heuristic_not_attestation():
    v = VALIDATION.read_text()
    assert "ndaaBlocklist" in v, "the NDAA screen must use a documented blocklist"
    assert "heuristic" in v.lower(), "the NDAA screen must be documented as a heuristic"
    assert re.search(r"not an attestation", v, re.I), "the NDAA screen must state it is NOT an attestation (CR-11)"
    # the heuristic warns; it must not FAIL on its own (the registry match is authoritative)
    assert 'status: "WARN"' in v, "the NDAA heuristic must be a WARN signal, not a FAIL"


def test_no_cr11_or_verdict_language_in_hardware_copy():
    offenders = []
    for f in COPY_FILES:
        text = f.read_text(errors="ignore")
        for pat in PROHIBITED:
            m = pat.search(text)
            if m:
                offenders.append(f"{f.name} :: /{pat.pattern}/ -> '{m.group(0)}'")
        vm = VERDICT.search(text)
        if vm:
            offenders.append(f"{f.name} :: verdict '{vm.group(0)}'")
    assert not offenders, "prohibited claim / verdict language in field hardware copy:\n" + "\n".join(offenders)
