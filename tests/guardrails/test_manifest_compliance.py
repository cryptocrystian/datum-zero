"""
Manifest-compliance guardrails (Layer 2 enforcement — see docs/DEV-PIPELINE.md).

These tests convert MANIFEST.md commandments into things that FAIL a build. Documentation
describes the rules; this suite enforces them. Runs in CI with no app/runtime dependencies.

Run: pytest tests/guardrails -q
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Client-facing output must be evidence-framed, never a verdict (CR-12).
VERDICT_TERMS = re.compile(r"\b(violation|breach|back[- ]?charge|penalty|liable|guilty)\b", re.I)

# Source that RENDERS client-facing payloads/reports. Extend as adapters land.
CLIENT_FACING_GLOBS = [
    "packages/adapters/**/*.ts",
    "packages/adapters/**/*.py",
    "packages/adapters/**/templates/**/*",
    "apps/web/**/adapters/**/*",
    # The classification/recommendation generator emits client-facing text (M0-07, CR-12).
    "apps/web/lib/rules/**/*.ts",
]

ALLOW_MARK = "guardrail:allow-verdict-term"  # explicit, reviewed escape hatch on a single line


def _iter_files(globs):
    for g in globs:
        yield from ROOT.glob(g)


def test_work_order_schema_is_valid_json():
    schema = ROOT / "packages/adapters/contracts/work-order.schema.json"
    assert schema.exists(), "canonical work-order contract is missing"
    data = json.loads(schema.read_text())
    assert data["title"].startswith("Datum Zero"), "unexpected contract title"
    # The recommendation.text field must keep its verdict-language guard.
    pat = data["properties"]["recommendation"]["properties"]["text"]["pattern"]
    for term in ("violation", "breach", "back"):
        assert term in pat, f"verdict-language guard weakened: '{term}' no longer blocked"


def test_no_verdict_language_in_client_facing_source():
    offenders = []
    for f in _iter_files(CLIENT_FACING_GLOBS):
        if not f.is_file():
            continue
        for i, line in enumerate(f.read_text(errors="ignore").splitlines(), 1):
            if ALLOW_MARK in line:
                continue
            if VERDICT_TERMS.search(line):
                offenders.append(f"{f.relative_to(ROOT)}:{i}: {line.strip()}")
    assert not offenders, "Verdict language in client-facing output (CR-12):\n" + "\n".join(offenders)


def test_governance_files_present():
    for req in ["MANIFEST.md", "CLAUDE.md", "docs/PRD-Corrections-Log.md"]:
        assert (ROOT / req).exists(), f"required governance file missing: {req}"


def test_schema_has_no_hardcoded_two_million_limit():
    """Coverage limit is a per-client profile, never a constant (CR-02)."""
    schema = (ROOT / "packages/db/prisma/schema.prisma").read_text()
    assert "requiredLiabilityLimit" in schema, "required-coverage profile field missing (CR-02)"
    assert re.search(r"default\(\s*2_?000_?000", schema) is None, "hardcoded $2M limit found (CR-02)"
