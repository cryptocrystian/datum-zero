"""
Guardrails for the server-enforced fail-closed COVERAGE gate on mission dispatch (M2-4a, CR-33 / CR-10).

A mission cannot be dispatched/activated without a verified-and-adequate policy for its window. Mirrors
the 100% QA gate (test_qa_gate.py):
  • the gate exists and THROWS (not warns) when coverage is not verified;
  • the mission dispatch entry point invokes the gate BEFORE it clears the mission (coverageVerified=true);
  • no code path clears a mission for dispatch (coverageVerified=true) outside the guarded module.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
GATE = WEB / "lib/insurance/coverage-gate.ts"
DISPATCH = WEB / "lib/missions/dispatch.ts"

# The dispatch-clearance write: marking a mission coverage-verified (cleared to fly).
CLEARED = re.compile(r"coverageVerified:\s*true")


def _is_test_or_e2e(f: Path) -> bool:
    return f.name.endswith(".test.ts") or f.name.endswith(".e2e.ts") or "e2e" in f.parts


def test_coverage_gate_present_and_throws():
    assert GATE.exists(), "coverage gate module missing"
    src = GATE.read_text()
    assert "assertCoverageVerifiedForDispatch" in src
    assert "coverageVerified" in src, "gate must key on coverageVerified"
    assert "throw new CoverageGateError" in src, "gate must FAIL CLOSED (throw), never warn"


def test_dispatch_enforces_gate_before_clearing_mission():
    assert DISPATCH.exists(), "mission dispatch entry point missing"
    src = DISPATCH.read_text()
    guard = src.find("assertCoverageVerifiedForDispatch(")
    cleared = CLEARED.search(src)
    assert guard != -1, "mission dispatch must invoke the coverage gate"
    assert cleared is not None, "dispatch must clear the mission (coverageVerified=true) on success"
    assert guard < cleared.start(), "the coverage gate must run BEFORE the mission is cleared for dispatch (CR-10)"


def test_no_dispatch_path_clears_coverage_outside_guarded_module():
    """Only the guarded mission-dispatch module may set coverageVerified=true (mirror the QA gate)."""
    allowed = DISPATCH.resolve()
    offenders = []
    for f in list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx")):
        if "node_modules" in f.parts or ".next" in f.parts or _is_test_or_e2e(f):
            continue
        if CLEARED.search(f.read_text(errors="ignore")) and f.resolve() != allowed:
            offenders.append(str(f.relative_to(ROOT)))
    assert not offenders, "a mission is cleared for dispatch (coverageVerified=true) outside the guarded module:\n" + "\n".join(offenders)
