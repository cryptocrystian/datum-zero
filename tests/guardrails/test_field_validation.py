"""
Guardrails for M1-05 — client-side validation pipeline (CR-11).

Asserts:
  • validation runs OFF the main thread (a Web Worker), never inline in a component;
  • the decision logic is PURE (no DOM / I/O / clock / randomness in validation.ts) and unit-tested;
  • the check thresholds are documented as PROVISIONAL (same posture as CR-19);
  • no CR-11-prohibited claims and no verdict language (CR-12) in the field validation copy.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
VALIDATION = WEB / "lib/field/validation.ts"
VALIDATION_TEST = WEB / "lib/field/validation.test.ts"
EXIF_TEST = WEB / "lib/field/exif.test.ts"
WORKER = WEB / "app/field/validation.worker.ts"
HOOK = WEB / "app/field/useValidation.ts"
COPY_FILES = [
    VALIDATION,
    WORKER,
    HOOK,
    WEB / "app/field/FileIntake.tsx",
    WEB / "app/field/ValidationResults.tsx",
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

# validation.ts must be a pure module — no browser globals, no I/O, no nondeterminism.
IMPURE_TOKENS = ["window", "document", "navigator", "self.", "exifr", "new Worker", "fetch(", "Date.now", "Math.random"]


def test_validation_runs_off_the_main_thread():
    assert WORKER.exists(), "a validation Web Worker must exist"
    wsrc = WORKER.read_text()
    assert "onmessage" in wsrc and "validateCaptureSet" in wsrc, "the worker must run the validator on messages"
    hook = HOOK.read_text()
    assert "new Worker(" in hook and "validation.worker" in hook, "the UI must run validation in a Worker, not inline"


def test_validation_logic_is_pure_and_unit_tested():
    assert VALIDATION_TEST.exists() and EXIF_TEST.exists(), "the pure validator + mapping must have unit tests"
    src = VALIDATION.read_text()
    offenders = [t for t in IMPURE_TOKENS if t in src]
    assert not offenders, "validation.ts must stay pure/deterministic; found: " + ", ".join(offenders)


def test_thresholds_are_documented_as_provisional():
    src = VALIDATION.read_text()
    assert "DEFAULT_VALIDATION_CONFIG" in src, "thresholds must be exposed as configurable defaults"
    assert "provisional" in src.lower() and "CR-19" in src, "thresholds must be flagged provisional pending field calibration (CR-19 posture)"


def test_no_cr11_or_verdict_language_in_field_validation_copy():
    offenders = []
    for f in COPY_FILES:
        text = f.read_text(errors="ignore")
        for pat in PROHIBITED:
            if pat.search(text):
                offenders.append(f"{f.name} :: /{pat.pattern}/")
        m = VERDICT.search(text)
        if m:
            offenders.append(f"{f.name} :: verdict '{m.group(0)}'")
    assert not offenders, "prohibited claim / verdict language in field validation copy:\n" + "\n".join(offenders)
