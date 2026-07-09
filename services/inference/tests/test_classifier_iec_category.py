"""
DET-1a classifier IEC-category coverage (relocated from the M2-1b detector refactor, CR-23).

When `detect()` became radiometric-only, the class-accuracy assertions that used to run 8-bit
InfraredSolarModules JPEGs *through* `detect()` moved here — to the classifier's true domain. The
classifier is unchanged; it runs on 8-bit crops (in the live pipeline, normalized from the radiometric
frame via `detector._stretch_u8`). CI runs these against the committed ONNX weights — never retrains.
"""
from pathlib import Path

from app.classifier import classify_image

SAMPLES = Path(__file__).resolve().parents[1] / "training" / "samples"
CELL = (SAMPLES / "Cell" / "4845.jpg").read_bytes()
NO_ANOMALY = (SAMPLES / "No-Anomaly" / "10000.jpg").read_bytes()
HOTSPOT_MULTI = (SAMPLES / "Hot-Spot-Multi" / "7911.jpg").read_bytes()


def test_classifier_assigns_iec_category_on_committed_crops():
    cell = classify_image(CELL)
    assert cell.label == "Cell" and cell.iec.iec_category == 2

    nominal = classify_image(NO_ANOMALY)
    assert nominal.label == "No-Anomaly" and nominal.iec.iec_category == 1

    severe = classify_image(HOTSPOT_MULTI)
    assert severe.label == "Hot-Spot-Multi" and severe.iec.iec_category == 3


def test_classification_is_deterministic():
    a = classify_image(CELL)
    b = classify_image(CELL)
    assert a == b
    assert 0.0 <= a.confidence <= 1.0
    assert a.model_version == "thermal-classifier-v1"
