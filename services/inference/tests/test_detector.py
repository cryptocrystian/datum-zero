"""
DET-1b detector + pipeline tests — deterministic real detection on COMMITTED sample frames, the
class + ΔT → served-priority combination, and the evidence-framed (no-verdict) callback boundary
(CR-12). CI runs these against the committed ONNX weights — never retrains.
"""
import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.detector import MODEL_VERSION, Detection, detect, render_crops
from app.iec_mapping import served_priority
from app.pipeline import build_callback_payload, process_session
from app.storage import LocalStorage, locator_to_key

SAMPLES = Path(__file__).resolve().parents[1] / "training" / "samples"
CELL = (SAMPLES / "Cell" / "4845.jpg").read_bytes()
NO_ANOMALY = (SAMPLES / "No-Anomaly" / "10000.jpg").read_bytes()
HOTSPOT_MULTI = (SAMPLES / "Hot-Spot-Multi" / "7911.jpg").read_bytes()

# Verdict language is a HARD STOP in any client-facing output (CR-12).
VERDICT_WORDS = ("violation", "breach", "back-charge", "back charge", "penalty", "liable")


def _radiometric_frame(base: int, hot: int) -> bytes:
    """A synthetic 16-bit radiometric frame with one hot block — exercises the radiometric path."""
    arr = np.full((240, 300), base, dtype=np.uint16)
    arr[100:130, 150:180] = hot
    buf = io.BytesIO()
    Image.fromarray(arr, mode="I;16").save(buf, format="TIFF")
    return buf.getvalue()


def test_detect_is_deterministic_on_committed_frame():
    a = detect(CELL)
    b = detect(CELL)
    assert a == b
    assert isinstance(a, Detection)
    assert a.metric_unit == "CELSIUS_DELTA"
    assert len(a.bounding_box) == 4 and all(isinstance(v, int) for v in a.bounding_box)
    assert 0.0 <= a.confidence_score <= 1.0
    assert a.metric_delta >= 0.0
    assert a.standard_ref == "IEC TS 62446-3"


def test_detect_classifies_committed_frames_to_iec_category():
    # High-accuracy DET-1a classes on committed crops → stable class + IEC category.
    cell = detect(CELL)
    assert cell.class_label == "Cell" and cell.iec_category == 2 and cell.priority == "SCHEDULED"

    nominal = detect(NO_ANOMALY)
    assert nominal.class_label == "No-Anomaly" and nominal.iec_category == 1 and nominal.priority == "MONITOR"

    severe = detect(HOTSPOT_MULTI)
    assert severe.class_label == "Hot-Spot-Multi" and severe.iec_category == 3 and severe.priority == "PROMPT"


def test_intensity_input_is_flagged_provisional():
    d = detect(CELL)  # 8-bit JPEG → intensity proxy
    assert d.radiometric is False
    assert d.delta_provisional is True


def test_radiometric_input_localizes_hotspot_and_is_not_provisional():
    d = detect(_radiometric_frame(base=2000, hot=2030))
    assert d.radiometric is True
    assert d.delta_provisional is False
    # ΔT is the native radiometric delta vs. the frame median (NOT the intensity proxy scale).
    assert d.metric_delta == pytest.approx(30.0, abs=0.5)
    # the hot block (rows 100-130, cols 150-180) is localized, not the whole 300x240 frame.
    x1, y1, x2, y2 = d.bounding_box
    assert (x1, y1) != (0, 0) or (x2, y2) != (300, 240)
    assert x1 >= 130 and x2 <= 300 and y1 >= 80


def test_high_delta_escalates_priority_toward_prompt():
    # A large ΔT can only ESCALATE the served category (class + ΔT combine); never downgrade.
    assert served_priority(1, 25.0) == (3, "PROMPT")
    assert served_priority(2, 12.0) == (2, "SCHEDULED")
    assert served_priority(3, 0.0) == (3, "PROMPT")
    # end to end: a ≥20°C radiometric ΔT lifts the served finding to Cat 3 / PROMPT.
    d = detect(_radiometric_frame(base=2000, hot=2030))
    assert d.iec_category == 3 and d.priority == "PROMPT"


def test_detect_rejects_empty():
    with pytest.raises(ValueError):
        detect(b"")


def test_render_crops_are_real_pngs_deterministic_and_distinct():
    d = detect(CELL)
    v1, a1 = render_crops(CELL, d.bounding_box)
    v2, a2 = render_crops(CELL, d.bounding_box)
    assert v1 == v2 and a1 == a2                 # deterministic
    assert v1 != a1                              # visual (grayscale) vs analytics (thermal-ramp)
    assert v1[:8] == b"\x89PNG\r\n\x1a\n"        # real PNG bytes, not a stub blob
    assert a1[:8] == b"\x89PNG\r\n\x1a\n"
    Image.open(io.BytesIO(v1)).verify()          # decodes as a valid image
    Image.open(io.BytesIO(a1)).verify()


def test_payload_carries_classification_and_stays_evidence_framed():
    payload = build_callback_payload(
        ingestion_session_id="s1",
        organization_id="o1",
        raw_storage_path="s3://b/k",
        detection=detect(CELL),
        visual_crop_url="s3://b/v",
        analytics_crop_url="s3://b/a",
        latitude=None,
        longitude=None,
        captured_at="2026-07-05T18:00:00Z",
    )
    assert payload["model_version"] == MODEL_VERSION == "thermal-classifier-v1"
    det = payload["detection"]
    # measurement layer (unchanged contract) + the classification the model now raises
    for k in ("confidence_score", "metric_delta", "bounding_box", "classification", "standard_ref"):
        assert k in det
    assert det["standard_ref"] == "IEC TS 62446-3"
    assert "IEC TS 62446-3" in det["classification"]
    # HARD STOP: no verdict language anywhere in the served output (CR-12).
    flat = str(payload).lower()
    for forbidden in VERDICT_WORDS:
        assert forbidden not in flat


def test_locator_round_trips():
    assert locator_to_key("s3://datum-zero-dev/org/x/capture.tif") == "org/x/capture.tif"
    assert locator_to_key("local://org/x/capture.tif") == "org/x/capture.tif"


def test_process_session_pipeline_with_local_storage(tmp_path):
    store = LocalStorage(str(tmp_path))
    store.put("org/o1/ingest/s1/capture.tif", CELL)

    captured = {}

    def fake_post(payload):
        captured["payload"] = payload
        return {"anomalyId": "det", "spatialBindingStatus": "UNBOUND_REVIEW"}

    result = process_session(
        ingestion_session_id="s1",
        organization_id="o1",
        raw_storage_path="local://org/o1/ingest/s1/capture.tif",
        storage=store,
        post=fake_post,
    )
    payload = result["payload"]
    assert payload["detection"]["metric_unit"] == "CELSIUS_DELTA"
    assert payload["detection"]["class_label"] == "Cell"
    # crops were written back through the port as REAL PNG bytes
    assert store.get("org/o1/anomalies/s1/visual_crop.png")[:8] == b"\x89PNG\r\n\x1a\n"
    assert store.get("org/o1/anomalies/s1/analytics_crop.png")[:8] == b"\x89PNG\r\n\x1a\n"
    assert result["callback"]["spatialBindingStatus"] == "UNBOUND_REVIEW"
