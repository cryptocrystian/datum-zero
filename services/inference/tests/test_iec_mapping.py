"""Pure tests for the class -> IEC TS 62446-3 mapping (DET-1a, CR-19 supersession)."""
import re

import pytest

from app.iec_mapping import (
    CLASS_LABELS,
    PRIORITY_BY_CATEGORY,
    classify,
)

VERDICT = re.compile(r"\b(violation|breach|back[- ]?charge|penalty|liable|guilty|fault of)\b", re.I)


def test_all_twelve_classes_map_consistently():
    assert len(CLASS_LABELS) == 12
    for label in CLASS_LABELS:
        c = classify(label)
        assert c.iec_category in (1, 2, 3)
        assert c.priority == PRIORITY_BY_CATEGORY[c.iec_category]
        assert c.standard_ref == "IEC TS 62446-3"
        assert c.condition  # non-empty, evidence-framed


def test_specific_severities():
    assert classify("No-Anomaly").iec_category == 1
    assert classify("No-Anomaly").priority == "MONITOR"
    assert classify("Cell").iec_category == 2
    assert classify("Cell").priority == "SCHEDULED"
    assert classify("Diode").iec_category == 3
    assert classify("Diode-Multi").iec_category == 3
    assert classify("Offline-Module").iec_category == 3
    assert classify("Cell-Multi").iec_category == 3


def test_environmental_flag():
    # environmental / reversible site conditions
    for env in ("Soiling", "Shadowing", "Vegetation"):
        assert classify(env).environmental is True
        assert classify(env).iec_category == 1
    # module faults are not environmental
    for fault in ("Cell", "Diode", "Offline-Module", "Cracking"):
        assert classify(fault).environmental is False


def test_conditions_are_evidence_framed_no_verdict_language():
    for label in CLASS_LABELS:
        assert not VERDICT.search(classify(label).condition), f"verdict language in {label}"


def test_unknown_label_raises():
    with pytest.raises(KeyError):
        classify("Not-A-Class")


def test_class_labels_are_canonical_sorted():
    # deterministic, stable order (must match the classifier's labels.json)
    assert list(CLASS_LABELS) == sorted(CLASS_LABELS)
