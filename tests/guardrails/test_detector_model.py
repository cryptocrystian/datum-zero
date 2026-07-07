"""
Guardrails for DET-1a — thermal anomaly classifier (CR-10/CR-19).

Asserts:
  • serving runs inference via onnxruntime and NEVER imports PyTorch; CI loads the committed ONNX
    and never retrains;
  • training deps (torch/torchvision) live ONLY in the [training] extra, not the serving deps;
  • the committed model + labels + NOTICE exist and the ONNX is small enough for plain git;
  • the class -> IEC mapping module stays pure (no ML/torch/numpy imports).

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INF = ROOT / "services/inference"
PYPROJECT = INF / "pyproject.toml"
CLASSIFIER = INF / "app/classifier.py"
MAPPING = INF / "app/iec_mapping.py"
ONNX = INF / "app/models/thermal-classifier-v1.onnx"
LABELS = INF / "app/models/labels.json"
NOTICE = INF / "app/models/NOTICE"
CI = ROOT / ".github/workflows/ci.yml"


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
