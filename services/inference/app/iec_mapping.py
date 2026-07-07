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
