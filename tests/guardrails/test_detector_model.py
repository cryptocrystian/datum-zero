"""
Guardrails for DET-1a/DET-1b — thermal anomaly classifier + real detector serving (CR-10/CR-19).

Asserts:
  • serving runs inference via onnxruntime and NEVER imports PyTorch; CI loads the committed ONNX
    and never retrains;
  • training deps (torch/torchvision) live ONLY in the [training] extra, not the serving deps;
  • the committed model + labels + NOTICE exist and the ONNX is small enough for plain git;
  • the class -> IEC mapping module stays pure (no ML/torch/numpy imports);
  • (DET-1b) the detector serves the classifier (not a stub), combines class + ΔT for the served
    priority, bumps the model version, emits the callback contract fields, and stays evidence-framed
    (no verdict language, CR-12).

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INF = ROOT / "services/inference"
PYPROJECT = INF / "pyproject.toml"
CLASSIFIER = INF / "app/classifier.py"
MAPPING = INF / "app/iec_mapping.py"
DETECTOR = INF / "app/detector.py"
PIPELINE = INF / "app/pipeline.py"
ONNX = INF / "app/models/thermal-classifier-v1.onnx"
LABELS = INF / "app/models/labels.json"
NOTICE = INF / "app/models/NOTICE"
CI = ROOT / ".github/workflows/ci.yml"

# Verdict language is a HARD STOP in any client-facing / served output (CR-12).
VERDICT_WORDS = ("violation", "breach", "back-charge", "penalty", "liable")


def test_serving_uses_onnxruntime_not_torch():
    src = CLASSIFIER.read_text()
    assert "onnxruntime" in src, "serving must run inference via onnxruntime"
    assert "import torch" not in src and "torchvision" not in src, "serving must NOT import PyTorch"


def test_training_deps_are_training_only():
    text = PYPROJECT.read_text()
    assert "[project.optional-dependencies]" in text, "training deps must live in an optional extra"
    main, extra = text.split("[project.optional-dependencies]", 1)
    assert "torch" not in main, "torch must NOT be a serving dependency"
    assert "onnxruntime" in main, "onnxruntime must be a serving dependency"
    assert "torch" in extra and "torchvision" in extra, "torch/torchvision belong in the [training] extra"


def test_committed_model_present_and_small():
    assert ONNX.exists(), "thermal-classifier-v1.onnx must be committed (CI loads it; never trains)"
    assert LABELS.exists(), "labels.json must be committed"
    assert NOTICE.exists(), "model NOTICE (dataset attribution) must be committed"
    size_mb = ONNX.stat().st_size / 1e6
    assert size_mb < 25, f"ONNX is {size_mb:.1f}MB — over the 25MB plain-git threshold (use Git LFS)"


def test_ci_never_retrains_and_installs_serving_only():
    ci = CI.read_text()
    assert "pip install -e ." in ci, "CI installs the inference package (serving deps only)"
    assert "[training]" not in ci, "CI must not install the training extra"
    assert "train.py" not in ci, "CI must never run training"


def test_mapping_module_is_pure():
    src = MAPPING.read_text()
    for banned in ("import torch", "import onnxruntime", "import numpy", "torchvision"):
        assert banned not in src, f"iec_mapping must stay pure (found {banned!r})"


def test_raw_dataset_is_gitignored():
    gi = (INF / "training/.gitignore").read_text()
    assert "data/" in gi, "the 20k-image raw dataset must be gitignored (never committed)"


# ---------------------------------------------------------------------------------------------------
# DET-1b — real detector serving (proposer + classifier + ΔT). Replaces the M0-05 stub.
# ---------------------------------------------------------------------------------------------------
def test_detector_serves_classifier_not_stub():
    src = DETECTOR.read_text()
    assert "from app.classifier import" in src and "classify_array" in src, \
        "DET-1b detector must serve the DET-1a ONNX classifier per proposal, not a threshold stub"
    assert "served_priority" in src, "detector must combine class + ΔT into the served priority"
    assert "hashlib" not in src, "the sha256-blob stub crops are gone — crops are real pixel PNGs"


def test_served_model_version_is_bumped():
    assert 'MODEL_VERSION = "thermal-classifier-v1"' in CLASSIFIER.read_text(), \
        "DET-1b serves the classifier weights — model version must be thermal-classifier-v1"


def test_delta_escalation_combines_class_and_delta():
    src = MAPPING.read_text()
    assert "def served_priority(" in src, "class + ΔT combination lives in iec_mapping.served_priority"
    assert "max(base_category" in src, "ΔT may only ESCALATE the class category, never downgrade"


def test_callback_payload_emits_contract_fields():
    src = PIPELINE.read_text()
    for field in ("bounding_box", "confidence_score", "metric_delta", "metric_unit",
                  "classification", "standard_ref", "visual_crop_url", "analytics_crop_url"):
        assert f'"{field}"' in src, f"served callback payload must emit {field!r}"


def test_serving_output_stays_evidence_framed():
    # The detector may now classify against the standard, but never adjudicates (CR-12): no verdict
    # words in any module that shapes the served output.
    for path in (DETECTOR, PIPELINE, MAPPING, CLASSIFIER):
        low = path.read_text().lower()
        for word in VERDICT_WORDS:
            assert word not in low, f"{path.name} must stay evidence-framed — found verdict word {word!r} (CR-12)"
