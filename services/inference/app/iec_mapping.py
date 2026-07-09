"""
Thermal anomaly class -> IEC TS 62446-3 category mapping (DET-1a, CR-10/CR-19).

Pure, deterministic, dependency-free. This SUPERSEDES the CR-19 ΔT-cutoff heuristic (≥10°C→Cat 2,
≥20°C→Cat 3): the classifier predicts one of the 12 InfraredSolarModules anomaly classes, and this
table maps each class to an IEC TS 62446-3 abnormality CATEGORY (1/2/3) + a priority + an
evidence-framed condition. Datum Zero MEASURES and CLASSIFIES against the standard; the client
adjudicates outcomes and a human QA gate approves every dispatch (CR-12). No verdict language.

PROVISIONAL (CR-19 posture): the *method* moves from ΔT-cutoff to learned-class-based, but the exact
category assignments below are still placeholders pending the standard's full matrix + field
calibration. Treat as configurable defaults; validate before any client-facing classification.
"""
from __future__ import annotations

from dataclasses import dataclass

STANDARD_REF = "IEC TS 62446-3"
STANDARD_VERSION = "2017"

# Fixed, canonical class order — MUST match the trained classifier's output labels (labels.json).
CLASS_LABELS: tuple[str, ...] = (
    "Cell",
    "Cell-Multi",
    "Cracking",
    "Diode",
    "Diode-Multi",
    "Hot-Spot",
    "Hot-Spot-Multi",
    "No-Anomaly",
    "Offline-Module",
    "Shadowing",
    "Soiling",
    "Vegetation",
)

# IEC category -> maintenance priority (evidence-framed; not a verdict).
PRIORITY_BY_CATEGORY = {1: "MONITOR", 2: "SCHEDULED", 3: "PROMPT"}


@dataclass(frozen=True)
class IecClassification:
    label: str
    iec_category: int  # IEC TS 62446-3 abnormality category: 1, 2, or 3
    priority: str  # MONITOR | SCHEDULED | PROMPT
    condition: str  # human-readable, evidence-framed condition + recommendation
    environmental: bool  # environmental/reversible (site) vs. a module fault
    standard_ref: str = STANDARD_REF
    standard_version: str = STANDARD_VERSION


# label -> (iec_category, environmental, condition)
_TABLE: dict[str, tuple[int, bool, str]] = {
    "No-Anomaly": (1, False, "Nominal — no thermal anomaly detected."),
    "Soiling": (1, True, "Soiling — surface contamination; clean at next scheduled maintenance."),
    "Shadowing": (1, True, "Shadowing — external obstruction; evaluate site layout."),
    "Vegetation": (1, True, "Vegetation encroachment — schedule vegetation management."),
    "Cracking": (2, False, "Module cracking — inspect and monitor for progression."),
    "Cell": (2, False, "Single hot cell — investigate at next scheduled maintenance."),
    "Hot-Spot": (2, False, "Single hot spot — investigate at next scheduled maintenance."),
    "Cell-Multi": (3, False, "Multiple hot cells — prompt corrective action recommended."),
    "Hot-Spot-Multi": (3, False, "Multiple hot spots — prompt corrective action recommended."),
    "Diode": (3, False, "Bypass diode activated (substring offline) — prompt corrective action recommended."),
    "Diode-Multi": (3, False, "Multiple bypass diodes activated — prompt corrective action recommended."),
    "Offline-Module": (3, False, "Module offline — prompt corrective action recommended."),
}


def classify(label: str) -> IecClassification:
    """Map a predicted anomaly class label to its IEC TS 62446-3 classification. Pure."""
    if label not in _TABLE:
        raise KeyError(f"unknown anomaly class: {label!r} (expected one of {CLASS_LABELS})")
    category, environmental, condition = _TABLE[label]
    return IecClassification(
        label=label,
        iec_category=category,
        priority=PRIORITY_BY_CATEGORY[category],
        condition=condition,
        environmental=environmental,
    )


def served_priority(
    base_category: int,
    metric_delta: float,
    *,
    scheduled_delta: float = 10.0,
    prompt_delta: float = 20.0,
) -> tuple[int, str]:
    """Combine the classifier's IEC category with the measured ΔT (°C) into the SERVED category +
    priority (DET-1b). A high ΔT can only ESCALATE toward Cat 3 / PROMPT per the IEC matrix — it
    never downgrades a pattern-class finding. Pure. PROVISIONAL bands (CR-19): the ΔT floors below
    mirror the placeholder M0-07 cutoffs and await the standard's full matrix + field calibration."""
    delta_category = 3 if metric_delta >= prompt_delta else 2 if metric_delta >= scheduled_delta else 1
    served = max(base_category, delta_category)
    return served, PRIORITY_BY_CATEGORY[served]


# ==================================================================================================
# M2-2a (CR-28) — GROUNDED IEC Category: pattern + irradiance-normalized ΔT -> objective IEC Category.
# ADDITIVE + CR-15-SAFE: this emits the objective CATEGORY ONLY (never MONITOR/SCHEDULED/PROMPT — that
# priority stays RuleSet/served_priority-owned). Thresholds are read from the IEC TS 62446-3 COMMITTEE
# DRAFT (82/1073) Annex C and are PROVISIONAL pending confirmation vs. the published IEC TS 62446-3:2017
# — do NOT stamp :2017. Grounding notes: docs/IEC-62446-3-MAPPING.md.
# ==================================================================================================

# Provenance marker carried on every grounded finding (payload + docs). Committee Draft, not published.
IEC_PROVENANCE = "IEC TS 62446-3 (CD / pending verification)"

# Extent exponents for the §7.4 irradiance normalization ΔT_norm = ΔT · (1000/G)^x.
EXTENT_POINT_X = 1.6      # sub-cell point sources (hot-spot, transfer resistance, heated junction box)
EXTENT_EXTENDED_X = 1.0   # extended-area (whole cell, substring, whole module, soiling)


@dataclass(frozen=True)
class _ClassRule:
    extent: str | None            # "point" | "extended" | None
    x: float | None               # extent exponent (None when no category applies)
    cat2_from: float | None       # ΔT_norm (K) at/above which the finding is >= Cat 2
    cat3_from: float | None       # ΔT_norm (K) at/above which it is Cat 3; None => capped at Cat 2
    requires_safety_review: bool = False  # human must confirm before a Category is trusted (Cracking)
    data_quality: bool = False    # not an abnormality — an invalid inspection condition (Shadowing)
    no_finding: bool = False      # nominal (No-Anomaly)
    grounding: str = "[PROV]"     # [CD] = read from Annex C; [PROV] = provisional pending grounding


# label -> grounded rule. See docs/IEC-62446-3-MAPPING.md for the Annex C source row per threshold.
_CATEGORY_RULES: dict[str, _ClassRule] = {
    "No-Anomaly":     _ClassRule(None, None, None, None, no_finding=True, grounding="[CD]"),
    # whole cell = EXTENDED (x=1.0), NOT point — corrects a prior draft. Annex C ex.7.
    "Cell":           _ClassRule("extended", EXTENT_EXTENDED_X, 10.0, 40.0, grounding="[CD]"),
    "Cell-Multi":     _ClassRule("extended", EXTENT_EXTENDED_X, 10.0, 40.0, grounding="[CD-derived]"),
    # sub-cell POINT source (x=1.6). Annex C has no discrete hot-spot row -> thresholds provisional.
    "Hot-Spot":       _ClassRule("point", EXTENT_POINT_X, 10.0, 40.0, grounding="[PROV]"),
    "Hot-Spot-Multi": _ClassRule("point", EXTENT_POINT_X, 10.0, 40.0, grounding="[PROV]"),
    # bypass diode active — Cat 3 needs serial-arc (backside, not front-visible) -> cap at Cat 2.
    "Diode":          _ClassRule("extended", EXTENT_EXTENDED_X, 2.0, None, grounding="[CD]"),
    "Diode-Multi":    _ClassRule("extended", EXTENT_EXTENDED_X, 2.0, None, grounding="[CD]"),
    "Offline-Module": _ClassRule("extended", EXTENT_EXTENDED_X, 2.0, None, grounding="[CD]"),
    # broken glass = isolation/shock risk -> Cat 3 CANDIDATE, but benign micro-crack != Cat 3.
    # Never a silent auto-3: emit Cat 3 + requiresSafetyReview so a human confirms isolation damage.
    "Cracking":       _ClassRule("extended", EXTENT_EXTENDED_X, None, None, requires_safety_review=True, grounding="[CD]"),
    # shading effects: rain-washable/transient -> Cat 1; persistent & high ΔT -> Cat 2 (threshold PROV,
    # single-frame persistence is unknown here).
    "Soiling":        _ClassRule("extended", EXTENT_EXTENDED_X, 10.0, None, grounding="[PROV]"),
    "Vegetation":     _ClassRule("extended", EXTENT_EXTENDED_X, 10.0, None, grounding="[PROV]"),
    # OPERATIONAL, not a fault: §5.1 requires shading-free inspection -> data-quality, not a Category.
    # (M2-2a flags it; the actual reroute to CaptureQualityEvent is M2-2b.)
    "Shadowing":      _ClassRule(None, None, None, None, data_quality=True, grounding="[CD]"),
}


@dataclass(frozen=True)
class IecCategoryResult:
    """Objective IEC TS 62446-3 (CD) Category for a classified abnormality. CATEGORY ONLY — no
    MONITOR/SCHEDULED/PROMPT (CR-15: priority is RuleSet client policy, applied downstream)."""
    label: str
    category: int | None          # COA Category 1/2/3, or None (No-Anomaly / Shadowing)
    extent: str | None            # "point" | "extended" | None
    x: float | None               # extent exponent used for normalization
    delta_t_norm: float | None    # ΔT normalized to 1000 W/m² (or raw ΔT if normalization UNAVAILABLE)
    normalization: str            # "APPLIED" | "UNAVAILABLE" | "NOT_APPLICABLE"
    requires_safety_review: bool  # human must confirm before the Category is trusted (Cracking)
    data_quality: bool            # invalid inspection condition, route to data-quality (Shadowing)
    provenance: str = IEC_PROVENANCE


def normalize_delta_t(delta_measured: float, g_measured: float, x: float) -> float:
    """§7.4 irradiance normalization to nominal 1000 W/m²: ΔT_norm = ΔT · (1000/G)^x. Pure."""
    return float(delta_measured) * (1000.0 / float(g_measured)) ** float(x)


def iec_category(label: str, delta_t: float, g_measured: float | None = None) -> IecCategoryResult:
    """Grounded pattern + normalized-ΔT -> objective IEC Category (CD, provisional). Pure/deterministic.

    Irradiance normalization is applied ONLY when G is present; missing G is carried honestly as
     (raw ΔT, category provisional) — never fabricated. Fail closed: an
    unknown class raises. No-Anomaly/Shadowing -> category None (no dispatchable finding)."""
    if label not in _CATEGORY_RULES:
        raise KeyError(f"unknown anomaly class: {label!r} (expected one of {CLASS_LABELS})")
    rule = _CATEGORY_RULES[label]

    # No category applies (nominal or an invalid inspection condition) -> normalization N/A.
    if rule.no_finding or rule.data_quality:
        return IecCategoryResult(label, None, rule.extent, rule.x, None, "NOT_APPLICABLE",
                                 rule.requires_safety_review, rule.data_quality)

    if g_measured is not None and g_measured > 0:
        dtn = normalize_delta_t(delta_t, g_measured, rule.x)
        normalization = "APPLIED"
    else:
        dtn = float(delta_t)  # honest fallback: raw ΔT, category provisional on un-normalized value
        normalization = "UNAVAILABLE"

    # Cracking: never a silent Category — emit a Cat 3 CANDIDATE gated on human safety review.
    if rule.requires_safety_review:
        category: int | None = 3
    elif rule.cat3_from is not None and dtn >= rule.cat3_from:
        category = 3
    elif rule.cat2_from is not None and dtn >= rule.cat2_from:
        category = 2
    else:
        category = 1

    return IecCategoryResult(label, category, rule.extent, rule.x, round(dtn, 2), normalization,
                             rule.requires_safety_review, rule.data_quality)
