"""
Guardrail — the integration roadmap can never reintroduce adjudicative language (CR-12, CR-21).

docs/INTEGRATION-ADAPTER-ROADMAP.md carries example payloads and evidenceSummary/description fields
that ship, conceptually, toward client CMMS/EAM systems. Those must stay evidence-only: this scans the
whole doc (payloads + prose) for the banned verdict set and fails the build if any appears.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "docs/INTEGRATION-ADAPTER-ROADMAP.md"

# Ticket-specified banned set (adds `enforce` to the core verdict terms).
BANNED = re.compile(r"\b(violation|breach|back-?charge|penalty|liable|enforce)\b", re.I)
ALLOW_MARK = "guardrail:allow-verdict-term"


def test_roadmap_present():
    assert DOC.exists(), "the canonical M2 integration roadmap must exist (CR-21)"
    assert "UnifiedAnomalyPayload" in DOC.read_text(), "roadmap must define the single internal envelope"


def test_roadmap_is_evidence_only():
    offenders = []
    for i, line in enumerate(DOC.read_text(encoding="utf-8").splitlines(), 1):
        if ALLOW_MARK in line:
            continue
        if BANNED.search(line):
            offenders.append(f"{i}: {line.strip()}")
    assert not offenders, "verdict language in the integration roadmap — evidence, not verdict (CR-12):\n" + "\n".join(offenders)


def test_roadmap_keeps_one_authoritative_output_contract():
    text = DOC.read_text(encoding="utf-8")
    # The envelope must reconcile TO the existing work-order schema, not spawn a competing one.
    assert "work-order.schema.json" in text, "roadmap must reference the canonical output contract"
    assert "single internal representation" in text, "envelope must be documented as the single internal object"
