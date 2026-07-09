"""
DET-1b detector serving, now on TRUE per-pixel °C (M2-1b, CR-22/CR-23).

On a radiometric capture:
  (0) DECODE — `RadiometricPort.read_temperature(bytes)` → a 2-D float32 °C array (FLIR/TIFF/DJI).
      Unknown-format or colorized-only input has NO usable radiometric channel → the detector FAILS
      CLOSED (returns a `FailClosed`, never a fabricated measurement). This replaces the M0 placeholder
      decode that treated any 16-bit/float PIL mode as if raw pixels were °C.
  (1) PROPOSER — threshold the °C frame → candidate regions/boxes (connected components).
  (2) CLASSIFY — for each proposal: normalize the °C crop to an 8-bit grayscale crop (`_stretch_u8`,
      the classifier's training domain) → DET-1a ONNX classifier → class + confidence → IEC
      TS 62446-3 category via `app.iec_mapping`.
  (3) ΔT — radiometric delta of a region vs. the frame median, in native °C. (The median-baseline
      upgrade is M2-1c; the algorithm here is unchanged — it now simply reads real °C.)
  (4) COMBINE — class + ΔT → the SERVED priority; a high ΔT escalates toward Cat 3 / PROMPT per the
      IEC matrix (`iec_mapping.served_priority`), never downgrades.

Measurement is radiometric-only (CR-23): the 8-bit intensity→°C provisional-ΔT proxy is RETIRED —
fabricating a ΔT from intensity is exactly what CR-22 forbids. Classification is unchanged:
the MobileNetV3 classifier still runs on an 8-bit crop (its true domain), now normalized FROM the
radiometric frame rather than a native 8-bit capture.

The engine MEASURES + CLASSIFIES against the standard; the CLIENT adjudicates and a human QA gate
approves every dispatch (CR-12). No verdict language. Deterministic: the same bytes → the same evidence.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app.classifier import MODEL_VERSION, classify_array
from app.iec_mapping import STANDARD_REF, served_priority
from app.radiometric import ParseStatus, RadiometricResult, build_default_port

__all__ = ["MODEL_VERSION", "Detection", "FailClosed", "DetectorConfig", "detect", "render_crops"]


@dataclass(frozen=True)
class DetectorConfig:
    hot_percentile: float = 99.0          # threshold = this percentile of frame values
    min_component_px: int = 2             # drop single-pixel specks
    box_pad_frac: float = 0.25            # pad each candidate box outward for module context
    max_work_dim: int = 256              # downscale ceiling for the connected-component scan
    single_module_max_dim: int = 160      # frames this small are treated as ONE module crop
    max_proposals: int = 8                # cap the classify fan-out (largest regions first)
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
    # --- provenance flags (radiometric always True now; delta_provisional retained at False for
    #     callback-contract stability, CR-23 — candidate for removal in a later contract revision) ---
    radiometric: bool
    delta_provisional: bool
    proposal_count: int


@dataclass(frozen=True)
class FailClosed:
    """No usable radiometric channel — a session data-quality failure, NOT a dispatchable anomaly
    (CR-22/CR-23). Carries the parse status + captured EXIF maker/model for later observability
    (surfacing is M2-1d; the unknown-format QA event is M2-1f)."""
    status: str                 # ParseStatus name: NO_RADIOMETRIC_CHANNEL | UNKNOWN_FORMAT
    reason: str
    manufacturer: str | None
    model: str | None


_FAIL_REASON = {
    ParseStatus.NO_RADIOMETRIC_CHANNEL: "capture has no usable radiometric channel (colorized/8-bit only)",
    ParseStatus.UNKNOWN_FORMAT: "unrecognized capture format — no radiometric decoder matched",
}

_PORT = None


def _port():
    """Lazily-built default RadiometricPort (FLIR, radiometric-TIFF, DJI). DJI stays env-pathed /
    mockable — an absent SDK fails closed to NO_RADIOMETRIC_CHANNEL."""
    global _PORT
    if _PORT is None:
        _PORT = build_default_port()
    return _PORT


# --------------------------------------------------------------------------------------------------
# frame + array helpers
# --------------------------------------------------------------------------------------------------
def _decode_celsius(image: bytes) -> RadiometricResult:
    """Decode a capture to true °C via the RadiometricPort. Never a PIL-mode heuristic (CR-22)."""
    return _port().read_temperature(image)


def _stretch_u8(region: np.ndarray) -> np.ndarray:
    """Min–max stretch a °C region to an 8-bit grayscale crop for the (intensity-trained) classifier."""
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


def _delta_t(arr: np.ndarray, box: tuple[int, int, int, int], frame_median: float) -> float:
    """ΔT (°C) of a region vs. the frame median. Real radiometric temperature only (CR-23). The
    region-vs-local-median baseline upgrade is M2-1c — the algorithm is unchanged here."""
    x1, y1, x2, y2 = box
    region = arr[y1:y2, x1:x2]
    if region.size == 0:
        region = arr
    return max(0.0, float(region.max()) - frame_median)


# --------------------------------------------------------------------------------------------------
# detection
# --------------------------------------------------------------------------------------------------
def detect(image: bytes, config: DetectorConfig = DEFAULT_CONFIG) -> Detection | FailClosed:
    """Decode true °C → propose → classify → ΔT → served priority. Fails closed (returns FailClosed,
    no fabricated measurement) when the capture has no usable radiometric channel (CR-22/CR-23)."""
    if not image:
        raise ValueError("empty image: nothing to detect")

    result = _decode_celsius(image)
    if result.status != ParseStatus.OK:
        return FailClosed(
            status=result.status.name,
            reason=_FAIL_REASON.get(result.status, result.status.name),
            manufacturer=result.manufacturer,
            model=result.model,
        )

    arr = np.asarray(result.temperature_c, dtype=np.float32)
    if arr.ndim != 2:  # defensive — a decoder must return a 2-D °C array
        arr = arr.reshape(arr.shape[0], -1)
    h, w = arr.shape
    frame_median = float(np.median(arr))
    single_module = max(h, w) <= config.single_module_max_dim

    proposals = _propose(arr, config)
    if not proposals:  # uniform / No-Anomaly frame → the whole frame is the one proposal
        proposals = [(0, 0, w, h)]

    if single_module:
        # The frame IS a single module crop — classify the WHOLE frame (matches DET-1a training on
        # module crops); the proposer only localizes the hotspot box + ΔT. Classify once.
        cls = classify_array(_stretch_u8(arr))
        box, delta = max(
            ((b, _delta_t(arr, b, frame_median)) for b in proposals),
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
            cls = classify_array(_stretch_u8(region))
            delta = _delta_t(arr, b, frame_median)
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
        radiometric=True,
        delta_provisional=False,
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
    as PNG bytes, from the decoded °C frame. Deterministic. Called only on a successful detection;
    a capture with no radiometric channel raises (the pipeline never reaches here on fail-closed)."""
    result = _decode_celsius(image)
    if result.status != ParseStatus.OK:
        raise ValueError(f"cannot render crops: {result.status.name}")
    arr = np.asarray(result.temperature_c, dtype=np.float32)
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
    return _png(_stretch_u8(region)), _colorize_png(region)
