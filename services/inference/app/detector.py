"""
DET-1b — real detector serving: hotspot proposer + DET-1a ONNX classifier + ΔT (CR-10).

Replaces the M0-05 threshold STUB. On an IR frame:
  (1) PROPOSER — threshold the radiometric thermal frame → candidate regions/boxes (connected
      components). For non-radiometric (8-bit intensity) input, an intensity-based proposer with a
      documented PROVISIONAL flag (`delta_provisional` / `radiometric=False`).
  (2) CLASSIFY — for each proposal: crop → DET-1a ONNX classifier → class + confidence → IEC
      TS 62446-3 category via the DET-1a mapping (`app.iec_mapping`).
  (3) ΔT — radiometric delta vs. the local (frame) median where available; else an intensity proxy
      (flagged provisional).
  (4) COMBINE — class + ΔT → the SERVED priority; a high ΔT escalates toward Cat 3 / PROMPT per the
      IEC matrix (`iec_mapping.served_priority`), never downgrades.

The engine MEASURES + CLASSIFIES against the standard; the CLIENT adjudicates outcomes and a human
QA gate approves every dispatch (CR-12) — the model raises candidates, the reviewer decides. No
verdict language. Deterministic: the same frame bytes always yield the same evidence.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app.classifier import MODEL_VERSION, classify_array
from app.iec_mapping import STANDARD_REF, served_priority

__all__ = ["MODEL_VERSION", "Detection", "DetectorConfig", "detect", "render_crops"]

# PIL modes that carry per-pixel radiometric values (16-bit / float). Everything else is treated as
# an 8-bit intensity proxy (ΔT flagged provisional).
_RADIOMETRIC_MODES = {"I", "I;16", "I;16B", "I;16L", "F"}


@dataclass(frozen=True)
class DetectorConfig:
    hot_percentile: float = 99.0          # threshold = this percentile of frame values
    min_component_px: int = 2             # drop single-pixel specks
    box_pad_frac: float = 0.25            # pad each candidate box outward for module context
    max_work_dim: int = 256              # downscale ceiling for the connected-component scan
    single_module_max_dim: int = 160      # frames this small are treated as ONE module crop
    max_proposals: int = 8                # cap the classify fan-out (largest regions first)
    intensity_celsius_per_dn: float = 0.1  # PROVISIONAL 8-bit DN → °C ΔT scale (CR-19)
    escalate_scheduled_delta: float = 10.0  # ΔT (°C) floor that lifts a finding to ≥ Cat 2
    escalate_prompt_delta: float = 20.0     # ΔT (°C) floor that lifts a finding to Cat 3 / PROMPT


DEFAULT_CONFIG = DetectorConfig()


@dataclass(frozen=True)
class Detection:
    # --- measurement / evidence layer (M0-05 contract, unchanged) ---
    confidence_score: float
    metric_delta: float
    metric_unit: str
    bounding_box: list[int]
    # --- standards classification layer (DET-1b: model raises the candidate; CR-12 gate unchanged) ---
    class_label: str
    iec_category: int
    priority: str
    classification: str        # evidence-framed, no verdict language
    standard_ref: str
    # --- provenance / provisional flags ---
    radiometric: bool
    delta_provisional: bool
    proposal_count: int


# --------------------------------------------------------------------------------------------------
# frame + array helpers
# --------------------------------------------------------------------------------------------------
def _load_frame(image: bytes) -> tuple[np.ndarray, bool]:
    """Decode → (2-D float32 array, radiometric?). Radiometric keeps native temperature values;
    intensity is loaded as 8-bit grayscale."""
    pil = Image.open(io.BytesIO(image))
    radiometric = pil.mode in _RADIOMETRIC_MODES
    if radiometric:
        arr = np.asarray(pil, dtype=np.float32)
    else:
        arr = np.asarray(pil.convert("L"), dtype=np.float32)
    if arr.ndim != 2:  # defensive — collapse any stray channel dim
        arr = arr.reshape(arr.shape[0], -1)
    return arr, radiometric


def _to_u8(region: np.ndarray, radiometric: bool) -> np.ndarray:
    """Grayscale uint8 for the classifier. 8-bit intensity passes through (matches DET-1a training);
    radiometric is min–max stretched to 0–255 (PROVISIONAL — the classifier is intensity-trained)."""
    if not radiometric:
        return np.clip(region, 0, 255).astype(np.uint8)
    return _stretch_u8(region)


def _stretch_u8(region: np.ndarray) -> np.ndarray:
    lo, hi = float(region.min()), float(region.max())
    if hi <= lo:
        return np.zeros(region.shape, dtype=np.uint8)
    return np.clip((region - lo) / (hi - lo) * 255.0, 0, 255).astype(np.uint8)


def _components(mask: np.ndarray, min_px: int) -> list[tuple[int, int, int, int]]:
    """4-connected component boxes over a boolean mask (pure BFS — no scipy/opencv). Deterministic
    (raster scan order). Returns [(x1, y1, x2, y2), ...] with x2/y2 exclusive."""
    h, w = mask.shape
    visited = np.zeros((h, w), dtype=bool)
    boxes: list[tuple[int, int, int, int]] = []
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if visited[sy, sx]:
            continue
        stack = [(sy, sx)]
        visited[sy, sx] = True
        minx = maxx = sx
        miny = maxy = sy
        area = 0
        while stack:
            y, x = stack.pop()
            area += 1
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    stack.append((ny, nx))
        if area >= min_px:
            boxes.append((minx, miny, maxx + 1, maxy + 1))
    return boxes


def _propose(arr: np.ndarray, config: DetectorConfig) -> list[tuple[int, int, int, int]]:
    """Threshold hot regions → padded candidate boxes in ORIGINAL frame coords. Empty if the frame
    is near-flat (no hotspot); the caller falls back to the whole frame."""
    h, w = arr.shape
    if max(h, w) > config.max_work_dim:  # downscale big frames for a fast CC scan
        s = config.max_work_dim / float(max(h, w))
        nw, nh = max(1, round(w * s)), max(1, round(h * s))
        work = np.asarray(Image.fromarray(arr, mode="F").resize((nw, nh), Image.BILINEAR), dtype=np.float32)
        scale_x, scale_y = w / nw, h / nh
    else:
        work, scale_x, scale_y = arr, 1.0, 1.0

    vmin, vmax = float(work.min()), float(work.max())
    if vmax - vmin <= 1e-6:
        return []  # truly flat → no hotspot to localize (scale-invariant; caller uses whole frame)

    thr = float(np.percentile(work, config.hot_percentile))
    if thr <= vmin:
        thr = vmin + (vmax - vmin) * 0.5
    mask = work >= thr

    boxes: list[tuple[int, int, int, int]] = []
    for (x1, y1, x2, y2) in _components(mask, config.min_component_px):
        # scale back to original coords + pad outward for module context
        ox1, oy1 = int(x1 * scale_x), int(y1 * scale_y)
        ox2, oy2 = int(round(x2 * scale_x)), int(round(y2 * scale_y))
        pw = int(round((ox2 - ox1) * config.box_pad_frac))
        ph = int(round((oy2 - oy1) * config.box_pad_frac))
        boxes.append((max(0, ox1 - pw), max(0, oy1 - ph), min(w, ox2 + pw), min(h, oy2 + ph)))

    # largest regions first, capped — bounds the classifier fan-out deterministically
    boxes.sort(key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
    return boxes[: config.max_proposals]


def _delta_t(arr: np.ndarray, box: tuple[int, int, int, int], frame_median: float,
             radiometric: bool, config: DetectorConfig) -> float:
    """ΔT of a region vs. the frame median. Radiometric → native °C; intensity → provisional proxy."""
    x1, y1, x2, y2 = box
    region = arr[y1:y2, x1:x2]
    if region.size == 0:
        region = arr
    raw = max(0.0, float(region.max()) - frame_median)
    return raw if radiometric else raw * config.intensity_celsius_per_dn


# --------------------------------------------------------------------------------------------------
# detection
# --------------------------------------------------------------------------------------------------
def detect(image: bytes, config: DetectorConfig = DEFAULT_CONFIG) -> Detection:
    """Propose hotspots → classify → ΔT → served priority. Deterministic evidence + classification."""
    if not image:
        raise ValueError("empty image: nothing to detect")

    arr, radiometric = _load_frame(image)
    h, w = arr.shape
    frame_median = float(np.median(arr))
    single_module = max(h, w) <= config.single_module_max_dim
    delta_provisional = not radiometric

    proposals = _propose(arr, config)
    if not proposals:  # uniform / No-Anomaly frame → the whole frame is the one proposal
        proposals = [(0, 0, w, h)]

    if single_module:
        # The frame IS a single module crop — classify the WHOLE frame (matches DET-1a training on
        # module crops); the proposer only localizes the hotspot box + ΔT. Classify once.
        cls = classify_array(_to_u8(arr, radiometric))
        box, delta = max(
            ((b, _delta_t(arr, b, frame_median, radiometric, config)) for b in proposals),
            key=lambda bd: bd[1],
        )
        served_cat, priority = served_priority(
            cls.iec.iec_category, delta,
            scheduled_delta=config.escalate_scheduled_delta,
            prompt_delta=config.escalate_prompt_delta,
        )
    else:
        # Multi-module frame — classify each candidate region; serve the MOST SEVERE finding (the
        # contract is one anomaly per callback). NOTE: reporting only the top finding is a known
        # limitation until the callback carries multiple detections (future ticket).
        best = None
        for b in proposals:
            x1, y1, x2, y2 = b
            region = arr[y1:y2, x1:x2]
            if region.size == 0:
                continue
            cls = classify_array(_to_u8(region, radiometric))
            delta = _delta_t(arr, b, frame_median, radiometric, config)
            served_cat, priority = served_priority(
                cls.iec.iec_category, delta,
                scheduled_delta=config.escalate_scheduled_delta,
                prompt_delta=config.escalate_prompt_delta,
            )
            rank = (served_cat, cls.confidence, delta)
            if best is None or rank > best[0]:
                best = (rank, b, cls, delta, served_cat, priority)
        _, box, cls, delta, served_cat, priority = best

    classification = f"{STANDARD_REF} Cat {served_cat} — {cls.label}: {cls.iec.condition}"
    if served_cat > cls.iec.iec_category:  # ΔT escalated above the pattern-class category
        classification += f" ΔT {delta:.1f}°C elevates priority to {priority}."

    x1, y1, x2, y2 = box
    return Detection(
        confidence_score=cls.confidence,
        metric_delta=round(delta, 1),
        metric_unit="CELSIUS_DELTA",
        bounding_box=[int(x1), int(y1), int(x2), int(y2)],
        class_label=cls.label,
        iec_category=served_cat,
        priority=priority,
        classification=classification,
        standard_ref=STANDARD_REF,
        radiometric=radiometric,
        delta_provisional=delta_provisional,
        proposal_count=len(proposals),
    )


# --------------------------------------------------------------------------------------------------
# crops
# --------------------------------------------------------------------------------------------------
def _png(gray_u8: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(gray_u8, mode="L").save(buf, format="PNG")
    return buf.getvalue()


def _colorize_png(region: np.ndarray) -> bytes:
    """Thermal-ramp (blue→red→yellow) RGB PNG of the region — the 'analytics' view."""
    g = _stretch_u8(region).astype(np.float32) / 255.0
    r = np.clip(2.0 * g, 0, 1)
    grn = np.clip(2.0 * g - 1.0, 0, 1)
    b = np.clip(1.0 - 2.0 * g, 0, 1)
    rgb = (np.stack([r, grn, b], axis=-1) * 255.0).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buf, format="PNG")
    return buf.getvalue()


def render_crops(image: bytes, box: list[int] | None = None) -> tuple[bytes, bytes]:
    """Render the ACTUAL visual (grayscale) + analytics (thermal-ramp) crops of the detection region
    as PNG bytes. Deterministic. Defaults to the whole frame when no box is given."""
    arr, radiometric = _load_frame(image)
    h, w = arr.shape
    if box is None:
        x1, y1, x2, y2 = 0, 0, w, h
    else:
        x1, y1, x2, y2 = box
    x1 = max(0, min(int(x1), w - 1))
    y1 = max(0, min(int(y1), h - 1))
    x2 = max(x1 + 1, min(int(x2), w))
    y2 = max(y1 + 1, min(int(y2), h))
    region = arr[y1:y2, x1:x2]
    return _png(_to_u8(region, radiometric)), _colorize_png(region)
