"""
DET-1a — deterministic ONNX smoke test. Loads the COMMITTED thermal-classifier-v1.onnx via
onnxruntime (no PyTorch) and asserts a stable prediction on a committed sample crop. CI runs this
against the committed weights — it never retrains.
"""
import json
from pathlib import Path

from app.classifier import MODEL_DIR, MODEL_PATH, MODEL_VERSION, classify_image

SERVICE_ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = SERVICE_ROOT / "training" / "samples"


def test_onnx_weights_are_committed():
    assert MODEL_PATH.exists(), "thermal-classifier-v1.onnx must be committed (CI never trains)"
    assert (MODEL_DIR / "labels.json").exists()
    assert (MODEL_DIR / "smoke.json").exists()


def test_deterministic_prediction_on_committed_sample():
    smoke = json.loads((MODEL_DIR / "smoke.json").read_text())
    image = (SAMPLES_DIR / smoke["sample"]).read_bytes()

    result = classify_image(image)
    # stable label recorded at export time
    assert result.label == smoke["expected_label"], f"{result.label} != {smoke['expected_label']}"
    # deterministic: same bytes -> same prediction
    assert classify_image(image).label == result.label
    assert 0.0 <= result.confidence <= 1.0
    assert result.model_version == MODEL_VERSION
    # the IEC mapping is wired end to end
    assert result.iec.iec_category in (1, 2, 3)
    assert result.iec.standard_ref == "IEC TS 62446-3"
