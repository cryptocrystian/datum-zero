"""
Serving-side thermal anomaly classifier (DET-1a, CR-10).

Loads the COMMITTED ONNX weights via onnxruntime — NO PyTorch at serve time. Preprocesses a crop
identically to training (grayscale -> resize -> ImageNet-normalized 3-channel), runs inference, and
maps the predicted class to its IEC TS 62446-3 classification (app.iec_mapping). Datum Zero measures +
classifies; the client adjudicates and a human QA gate approves dispatch (CR-12).
"""
from __future__ import annotations

import io
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

from app.iec_mapping import CLASS_LABELS, IecClassification, classify

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIR / "thermal-classifier-v1.onnx"
MODEL_VERSION = "thermal-classifier-v1"

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


@lru_cache(maxsize=1)
def _session() -> tuple[ort.InferenceSession, tuple[str, ...], int]:
    cfg = json.loads((MODEL_DIR / "labels.json").read_text())
    labels = tuple(cfg["labels"])
    if labels != tuple(CLASS_LABELS):
        raise RuntimeError("labels.json is out of sync with app.iec_mapping.CLASS_LABELS")
    sess = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    return sess, labels, int(cfg["img_size"])


def _preprocess(image: bytes, img_size: int) -> np.ndarray:
    pil = Image.open(io.BytesIO(image)).convert("L").resize((img_size, img_size), Image.BILINEAR)
    g = np.asarray(pil, dtype=np.float32) / 255.0
    x = np.stack([g, g, g], axis=0)  # 3xHxW
    x = (x - IMAGENET_MEAN[:, None, None]) / IMAGENET_STD[:, None, None]
    return x[None].astype(np.float32)  # 1x3xHxW


def _softmax(z: np.ndarray) -> np.ndarray:
    e = np.exp(z - z.max())
    return e / e.sum()


@dataclass(frozen=True)
class Classification:
    label: str
    confidence: float
    iec: IecClassification
    model_version: str = MODEL_VERSION


def classify_image(image: bytes) -> Classification:
    """Classify a thermal crop -> anomaly class + IEC TS 62446-3 classification. Deterministic."""
    if not image:
        raise ValueError("empty image: nothing to classify")
    sess, labels, img_size = _session()
    logits = sess.run(None, {"input": _preprocess(image, img_size)})[0][0]
    probs = _softmax(logits)
    idx = int(probs.argmax())
    return Classification(
        label=labels[idx],
        confidence=round(float(probs[idx]), 4),
        iec=classify(labels[idx]),
    )
