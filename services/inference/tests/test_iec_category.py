"""
M2-2a (CR-28) — grounded IEC Category mapping: pattern + irradiance-normalized ΔT -> objective IEC
Category. Deterministic. CATEGORY ONLY (CR-15: no MONITOR/SCHEDULED/PROMPT here). Thresholds are from
the IEC TS 62446-3 Committee Draft (provisional); see docs/IEC-62446-3-MAPPING.md.
"""
import math

import pytest

from app.iec_mapping import (
    IEC_PROVENANCE,
    CLASS_LABELS,
    iec_category,
    normalize_delta_t,
)

# Priority vocabulary must NEVER appear in the objective-category layer (CR-15 boundary).
PRIORITY_WORDS = ("MONITOR", "SCHEDULED", "PROMPT")


def test_per_class_category_on_normalized_delta():
    # hot classes: <10 -> Cat 1, 10-40 -> Cat 2, >40 -> Cat 3.
    assert iec_category("Cell", 30.0).category == 2
    assert iec_category("Cell", 45.0).category == 3
    assert iec_category("Cell", 5.0).category == 1
    assert iec_category("Cell-Multi", 45.0).category == 3
    assert iec_category("Hot-Spot", 30.0).category == 2
    assert iec_category("Hot-Spot", 41.0).category == 3
    # substring/module faults: >=2 -> Cat 2 (front-visible cap), <2 -> Cat 1; never auto-3.
    assert iec_category("Offline-Module", 5.0).category == 2
    assert iec_category("Offline-Module", 1.0).category == 1
    assert iec_category("Diode", 5.0).category == 2
    assert iec_category("Diode", 100.0).category == 2  # capped at Cat 2 (no front-visible serial arc)
    assert iec_category("Diode-Multi", 5.0).category == 2
    # shading effects.
    assert iec_category("Soiling", 2.0).category == 1
    assert iec_category("Soiling", 20.0).category == 2
    assert iec_category("Vegetation", 2.0).category == 1


def test_no_anomaly_and_shadowing_have_no_category():
    nom = iec_category("No-Anomaly", 0.0)
    assert nom.category is None and nom.data_quality is False and nom.normalization == "NOT_APPLICABLE"
    shad = iec_category("Shadowing", 50.0)
    assert shad.category is None          # NOT an abnormality
    assert shad.data_quality is True      # routes to data-quality (reroute itself is M2-2b)


def test_cracking_requires_safety_review_never_silent_cat3():
    for dt in (1.0, 15.0, 60.0):
        r = iec_category("Cracking", dt)
        assert r.requires_safety_review is True  # a human must confirm isolation-affecting damage
        assert r.category == 3                    # Cat 3 CANDIDATE — surfaced, gated, never silent


def test_extent_exponent_correction():
    # Cell = EXTENDED (x=1.0); only Hot-Spot = POINT (x=1.6). Guards the correction.
    assert iec_category("Cell", 30.0).x == 1.0 and iec_category("Cell", 30.0).extent == "extended"
    assert iec_category("Hot-Spot", 30.0).x == 1.6 and iec_category("Hot-Spot", 30.0).extent == "point"


def test_irradiance_normalization_applied():
    # 11.5 K at 724 W/m², point (x=1.6) -> ~19.3 K normalized to 1000 W/m².
    r = iec_category("Hot-Spot", 11.5, g_measured=724.0)
    assert r.normalization == "APPLIED"
    expected = 11.5 * (1000.0 / 724.0) ** 1.6
    assert r.delta_t_norm == pytest.approx(expected, abs=0.05)
    assert r.delta_t_norm == pytest.approx(19.3, abs=0.2)
    assert r.category == 2  # 19.3 K in 10-40 band


def test_missing_irradiance_is_honest_unavailable_never_fabricated():
    r = iec_category("Hot-Spot", 11.5)  # no G
    assert r.normalization == "UNAVAILABLE"
    assert r.delta_t_norm == pytest.approx(11.5)  # raw ΔT carried un-normalized
    assert r.category == 2


def test_normalize_delta_t_pure():
    assert normalize_delta_t(10.0, 1000.0, 1.6) == pytest.approx(10.0)  # already nominal
    assert normalize_delta_t(10.0, 500.0, 1.0) == pytest.approx(20.0)   # linear extent


def test_cr15_boundary_no_priority_vocabulary():
    # The grounded result carries NO MONITOR/SCHEDULED/PROMPT — priority is RuleSet policy (CR-15).
    for label in CLASS_LABELS:
        r = iec_category(label, 25.0)
        flat = f"{r.category} {r.extent} {r.normalization} {r.provenance}"
        for w in PRIORITY_WORDS:
            assert w not in flat
        assert not hasattr(r, "priority")


def test_provenance_is_committee_draft_not_published():
    r = iec_category("Cell", 30.0)
    assert r.provenance == IEC_PROVENANCE
    assert "CD / pending verification" in r.provenance
    assert ":2017" not in r.provenance  # do NOT stamp the published year on CD-sourced thresholds
