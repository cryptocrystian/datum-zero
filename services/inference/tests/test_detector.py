"""
M0-05 detector + pipeline tests — determinism and the evidence-only boundary (CR-12).
"""
import pytest

from app.detector import MODEL_VERSION, Detection, detect, render_crops
from app.pipeline import build_callback_payload, process_session
from app.storage import LocalStorage, locator_to_key

SAMPLE = b"FAKE_THERMAL_TIFF_BYTES_0001\x00\xff\x10\x80abcdef"


def test_detect_is_deterministic():
    a = detect(SAMPLE)
    b = detect(SAMPLE)
    assert a == b
    assert isinstance(a, Detection)
    assert a.metric_unit == "CELSIUS_DELTA"
    assert len(a.bounding_box) == 4 and all(isinstance(v, int) for v in a.bounding_box)
    assert 0.0 <= a.confidence_score <= 1.0
    assert a.metric_delta >= 0.0


def test_detect_rejects_empty():
    with pytest.raises(ValueError):
        detect(b"")


def test_render_crops_deterministic_and_distinct():
    v1, a1 = render_crops(SAMPLE)
    v2, a2 = render_crops(SAMPLE)
    assert v1 == v2 and a1 == a2
    assert v1 != a1  # visual and analytics crops differ


def test_locator_round_trips():
    assert locator_to_key("s3://datum-zero-dev/org/x/capture.tif") == "org/x/capture.tif"
    assert locator_to_key("local://org/x/capture.tif") == "org/x/capture.tif"


def test_payload_is_evidence_only():
    payload = build_callback_payload(
        ingestion_session_id="s1",
        organization_id="o1",
        raw_storage_path="s3://b/k",
        detection=detect(SAMPLE),
        visual_crop_url="s3://b/v",
        analytics_crop_url="s3://b/a",
        latitude=None,
        longitude=None,
        captured_at="2026-07-05T18:00:00Z",
    )
    assert payload["model_version"] == MODEL_VERSION
    # Measurement layer present; adjudication layer absent (M0-07 owns it).
    for k in ("confidence_score", "metric_delta", "bounding_box"):
        assert k in payload["detection"]
    flat = str(payload).lower()
    for forbidden in ("classification", "recommendation", "violation", "breach", "penalty"):
        assert forbidden not in flat


def test_process_session_pipeline_with_local_storage(tmp_path):
    store = LocalStorage(str(tmp_path))
    store.put("org/o1/ingest/s1/capture.tif", SAMPLE)

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
    # crops were written back through the port
    assert store.get("org/o1/anomalies/s1/visual_crop.bin").startswith(b"VISUAL_CROP:")
    assert result["callback"]["spatialBindingStatus"] == "UNBOUND_REVIEW"
