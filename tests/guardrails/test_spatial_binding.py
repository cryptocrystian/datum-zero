"""
Guardrails for M0-06 — spatial auto-binding is org-scoped and FAILS CLOSED on identity (CR-13, CR-16).

Binding must never guess: a match beyond the bind radius or an ambiguous (near-equidistant) pair
leaves the anomaly UNBOUND_REVIEW; only a single, in-range, unambiguous asset flips it to BOUND.
The registry lookup is strictly organizationId-scoped (multi-tenant native).

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BINDING = ROOT / "apps/web/lib/binding/spatial-binding.ts"


def test_binding_module_present():
    assert BINDING.exists(), "spatial-binding module missing (M0-06)"


def test_binding_is_org_scoped():
    src = BINDING.read_text()
    # Both the anomaly read and the asset registry lookup must be tenant-scoped.
    assert src.count("organizationId") >= 3, "binding queries must be organizationId-scoped"
    assert "where: { organizationId" in src, "asset lookup must filter by organizationId"


def test_binding_has_fail_closed_thresholds():
    src = BINDING.read_text()
    for token in (
        "MAX_BIND_DISTANCE_METERS",
        "AMBIGUITY_MARGIN_METERS",
        "NO_MATCH_IN_RANGE",
        "AMBIGUOUS",
    ):
        assert token in src, f"binding must implement the fail-closed guard '{token}' (CR-13)"


def test_binding_only_sets_bound_on_confident_match():
    """The DB flip to BOUND must be guarded by a confident decision — never force-bound."""
    src = BINDING.read_text()
    guard = src.find('decision.status === "BOUND"')
    update = src.find("prisma.anomaly.update")
    assert guard != -1, "the BOUND write must be guarded by a confident decision"
    assert update != -1, "binding must persist a confident match"
    assert guard < update, "prisma.anomaly.update(...BOUND) must sit inside the confident branch"
