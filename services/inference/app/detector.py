"""
Deterministic thermal-threshold detector (STUB — real CV is bought/fine-tuned later, CR-10).

The engine MEASURES only; it never classifies against a standard and never adjudicates (CR-12).
Classification/recommendation land in M0-07. Determinism matters for testing: the same image
bytes always yield the same evidence.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

MODEL_VERSION = "thermal-threshold-v0.1.0"

# Assumed thermal frame used to map the hottest sample index → a bounding box.
FRAME_W, FRAME_H = 640, 512


@dataclass(frozen=True)
class Detection:
    confidence_score: float
    metric_delta: float
    metric_unit: str
    bounding_box: list[int]


def detect(image: bytes) -> Detection:
    """Find the hottest region and quantify its delta vs. the frame median. Deterministic."""
    if not image:
        raise ValueError("empty image: nothing to detect")

    values = list(image)  # bytes 0..255 stand in for per-pixel thermal intensity
    n = len(values)
    median = sorted(values)[n // 2]
    hottest = max(values)
    idx = values.index(hottest)
    delta_intensity = hottest - median

    # Stub calibration → plausible, deterministic evidence.
    metric_delta = round(delta_intensity * 0.1, 1)  # °C delta vs. median
    confidence_score = round(min(0.999, 0.5 + delta_intensity / 512), 3)

    cx, cy = idx % FRAME_W, (idx // FRAME_W) % FRAME_H
    x1, y1 = max(0, cx - 8), max(0, cy - 8)
    x2, y2 = min(FRAME_W, cx + 8), min(FRAME_H, cy + 8)

    return Detection(
        confidence_score=confidence_score,
        metric_delta=metric_delta,
        metric_unit="CELSIUS_DELTA",
        bounding_box=[x1, y1, x2, y2],
    )


def render_crops(image: bytes) -> tuple[bytes, bytes]:
    """Stub crops — deterministic derived blobs (real CV renders actual pixel crops)."""
    digest = hashlib.sha256(image).hexdigest()
    visual = f"VISUAL_CROP:{digest}".encode()
    analytics = f"ANALYTICS_CROP:{digest}".encode()
    return visual, analytics
