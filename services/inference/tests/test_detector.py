"""
M2-1b detector + pipeline tests — the detector now runs on TRUE decoded °C (RadiometricPort), and
FAILS CLOSED on a capture with no usable radiometric channel (CR-22/CR-23). Deterministic.

Measurement is radiometric-only: `detect()` is exercised on synthetic radiometric TIFF fixtures with
KNOWN °C, plus 8-bit/colorized fail-closed cases. The classifier's category-accuracy coverage lives in
`test_classifier_iec_category.py` (its true 8-bit domain) — it moved there when the intensity-proxy
`detect()` path was retired (CR-23). No coverage was lost.
"""
import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.detector import MODEL_VERSION, Detection, FailClosed, detect, render_crops
from app.pipeline import build_callback_payload, process_session
from app.storage import LocalStorage, locator_to_key

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
# Verdict language is a HARD STOP in any client-facing output (CR-12).
VERDICT_WORDS = ("violation", "breach", "back-charge", "back charge", "penalty", "liable")


# ---- fixtures: synthetic radiometric TIFF with KNOWN °C (centi-Kelvin container, per tiff.py) -------
def _dn(celsius: float) -> int:
    """Inverse of tiff.py's decode (T_C = raw*0.01 − 273.15): °C → 16-bit centi-Kelvin DN."""
    return int(round((celsius + 273.15) * 100.0))


def radiometric_tiff(base_c: float, hot_c: float, shape=(240, 300)) -> bytes:
    """A 16-bit radiometric TIFF: a uniform base with one hot block (rows 100-130, cols 150-180)."""
    arr = np.full(shape, _dn(base_c), dtype=np.uint16)
    arr[100:130, 150:180] = _dn(hot_c)
    buf = io.BytesIO()
    # Pillow infers mode "I;16" from the uint16 dtype; the explicit mode= arg was removed in newer Pillow.
    Image.fromarray(arr).save(buf, format="TIFF")
    return buf.getvalue()


def plain_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (120, 10, 10)).save(buf, format="JPEG")
    return buf.getvalue()


def colorized_tiff() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (10, 20, 30)).save(buf, format="TIFF")  # 8-bit, no thermal band
    return buf.getvalue()


RADIO = radiometric_tiff(base_c=27.0, hot_c=57.0)  # a hot block 30 °C above the frame


# ---- happy path: real decoded °C ------------------------------------------------------------------
def test_detect_is_deterministic_on_radiometric_frame():
    a = detect(RADIO)
    b = detect(RADIO)
    assert a == b
    assert isinstance(a, Detection)
    assert a.metric_unit == "CELSIUS_DELTA"
    assert a.radiometric is True and a.delta_provisional is False
    assert len(a.bounding_box) == 4 and all(isinstance(v, int) for v in a.bounding_box)
    assert 0.0 <= a.confidence_score <= 1.0
    assert a.metric_delta >= 0.0
    assert a.standard_ref == "IEC TS 62446-3"


def test_delta_is_real_celsius_from_decoded_temperature():
    d = detect(RADIO)
    assert isinstance(d, Detection)
    # ΔT is the NATIVE radiometric delta of the hot block vs. the frame median: 57 − 27 = 30 °C —
    # derived from decoded °C, NOT raw placeholder pixel values.
    assert d.metric_delta == pytest.approx(30.0, abs=0.5)
    # the hot block (rows 100-130, cols 150-180) is localized, not the whole 300x240 frame.
    x1, y1, x2, y2 = d.bounding_box
    assert (x1, y1) != (0, 0) or (x2, y2) != (300, 240)
    assert x1 >= 130 and x2 <= 300 and y1 >= 80


def test_detection_carries_no_served_priority_or_category():
    # M2-2c/CR-30: the served_priority category+ΔT fusion is RETIRED. detect() no longer emits a
    # fused category or priority — the OBJECTIVE grounded category is on the payload; priority is
    # RuleSet client policy over that category (apps/web/lib/rules/tolerance-eval.ts).
    assert "priority" not in Detection.__dataclass_fields__
    assert "iec_category" not in Detection.__dataclass_fields__
    assert "grounded_iec_category" in Detection.__dataclass_fields__  # the objective category remains


# ---- fail closed: no usable radiometric channel (CR-22/CR-23) --------------------------------------
def test_intensity_jpeg_fails_closed():
    # An 8-bit JPEG has no radiometric channel — never classify a fabricated ΔT (the retired proxy).
    d = detect(plain_jpeg())
    assert isinstance(d, FailClosed)
    assert d.status == "UNKNOWN_FORMAT"
    assert d.reason and not hasattr(d, "metric_delta")  # no fabricated measurement


def test_colorized_tiff_fails_closed():
    d = detect(colorized_tiff())
    assert isinstance(d, FailClosed)
    assert d.status == "NO_RADIOMETRIC_CHANNEL"
    assert d.reason


def test_fail_closed_carries_manufacturer_model_when_present():
    # A DJI-maker JPEG with the SDK absent → fail closed, EXIF maker/model captured (for M2-1d/f).
    img = io.BytesIO()
    pic = Image.new("RGB", (16, 16), (0, 0, 0))
    exif = pic.getexif()
    exif[0x010F] = "DJI"
    exif[0x0110] = "Zenmuse H20T"
    pic.save(img, format="JPEG", exif=exif)
    d = detect(img.getvalue())
    assert isinstance(d, FailClosed)
    assert d.status == "NO_RADIOMETRIC_CHANNEL"
    assert d.manufacturer is not None and "DJI" in d.manufacturer.upper()
    assert d.model == "Zenmuse H20T"


def test_detect_rejects_empty():
    with pytest.raises(ValueError):
        detect(b"")


# ---- crops (from decoded °C) ----------------------------------------------------------------------
def test_render_crops_are_real_pngs_deterministic_and_distinct():
    d = detect(RADIO)
    v1, a1 = render_crops(RADIO, d.bounding_box)
    v2, a2 = render_crops(RADIO, d.bounding_box)
    assert v1 == v2 and a1 == a2                 # deterministic
    assert v1 != a1                              # visual (grayscale) vs analytics (thermal-ramp)
    assert v1[:8] == PNG_MAGIC and a1[:8] == PNG_MAGIC
    Image.open(io.BytesIO(v1)).verify()          # decodes as a valid image
    Image.open(io.BytesIO(a1)).verify()


# ---- callback boundary (evidence-framed, no verdict) ----------------------------------------------
def test_payload_carries_classification_and_stays_evidence_framed():
    payload = build_callback_payload(
        ingestion_session_id="s1",
        organization_id="o1",
        raw_storage_path="s3://b/k",
        detection=detect(RADIO),
        visual_crop_url="s3://b/v",
        analytics_crop_url="s3://b/a",
        latitude=None,
        longitude=None,
        captured_at="2026-07-05T18:00:00Z",
    )
    assert payload["model_version"] == MODEL_VERSION == "thermal-classifier-v1"
    det = payload["detection"]
    for k in ("confidence_score", "metric_delta", "bounding_box", "classification", "standard_ref"):
        assert k in det
    assert det["standard_ref"] == "IEC TS 62446-3"
    assert "IEC TS 62446-3" in det["classification"]
    assert det["radiometric"] is True and det["delta_provisional"] is False
    assert det["detected_format"] == "RADIOMETRIC_TIFF"  # radiometric provenance (M2-1e/CR-27)
    # grounded IEC Category (M2-2a/CR-28) — additive, Category only (no priority), CD provenance.
    assert det["grounded_iec_category"] in (1, 2, 3, None)
    assert det["iec_normalization"] == "UNAVAILABLE"  # no irradiance available to the detector yet
    assert "CD / pending verification" in det["iec_provenance"]
    assert isinstance(det["requires_safety_review"], bool)
    assert det["geometry_status"] == "UNVERIFIED"  # geometry validity (M2-2b/CR-29) — inputs not wired yet
    # HARD STOP: no verdict language anywhere in the served output (CR-12).
    flat = str(payload).lower()
    for forbidden in VERDICT_WORDS:
        assert forbidden not in flat


def test_locator_round_trips():
    assert locator_to_key("s3://datum-zero-dev/org/x/capture.tif") == "org/x/capture.tif"
    assert locator_to_key("local://org/x/capture.tif") == "org/x/capture.tif"


# ---- pipeline: dispatch on OK, and channel preservation -------------------------------------------
def test_process_session_pipeline_with_radiometric_capture(tmp_path):
    store = LocalStorage(str(tmp_path))
    raw = radiometric_tiff(base_c=27.0, hot_c=57.0)
    store.put("org/o1/ingest/s1/capture.tif", raw)

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
    assert result["status"] == "OK" and result["dispatched"] is True
    payload = result["payload"]
    assert payload["detection"]["metric_unit"] == "CELSIUS_DELTA"
    assert payload["detection"]["radiometric"] is True
    # crops were written back through the port as REAL PNG bytes
    assert store.get("org/o1/anomalies/s1/visual_crop.png")[:8] == PNG_MAGIC
    assert store.get("org/o1/anomalies/s1/analytics_crop.png")[:8] == PNG_MAGIC
    assert result["callback"]["spatialBindingStatus"] == "UNBOUND_REVIEW"


def test_channel_preservation_source_bytes_unchanged_and_derivative_distinct(tmp_path):
    # The raw radiometric source of record survives byte-for-byte; the colorized crops are a SEPARATE
    # asset the detector never reads (CR-22 channel preservation).
    store = LocalStorage(str(tmp_path))
    raw = radiometric_tiff(base_c=30.0, hot_c=65.0)
    store.put("org/o1/ingest/s1/capture.tif", raw)
    process_session(
        ingestion_session_id="s1",
        organization_id="o1",
        raw_storage_path="local://org/o1/ingest/s1/capture.tif",
        storage=store,
        post=lambda p: {"anomalyId": "x"},
    )
    assert store.get("org/o1/ingest/s1/capture.tif") == raw          # unmodified source of record
    assert store.get("org/o1/anomalies/s1/analytics_crop.png") != raw  # distinct display derivative


def test_process_session_fails_closed_records_quality_event_not_anomaly(tmp_path):
    store = LocalStorage(str(tmp_path))
    store.put("org/o1/ingest/s1/capture.jpg", plain_jpeg())  # 8-bit, no radiometric channel

    anomaly_posts, quality_posts = [], []
    result = process_session(
        ingestion_session_id="s1",
        organization_id="o1",
        raw_storage_path="local://org/o1/ingest/s1/capture.jpg",
        storage=store,
        post=lambda p: anomaly_posts.append(p),
        post_quality=lambda p: (quality_posts.append(p) or {"captureQualityEventId": "cqe"}),
    )
    assert result["dispatched"] is False
    assert result["status"] == "UNKNOWN_FORMAT"
    assert result["payload"] is None and result["callback"] is None
    # the anomaly callback is NEVER hit; the DISTINCT capture-quality callback records the rejection.
    assert anomaly_posts == []
    assert len(quality_posts) == 1
    q = quality_posts[0]
    assert q["status"] == "UNKNOWN_FORMAT"
    assert q["ingestion_session_id"] == "s1" and q["organization_id"] == "o1"
    assert q["detected_format"] is None  # no decoder matched a plain JPEG
    assert q["format_fingerprint"] == "JPEG"  # actionable container signal for the demand aggregate
    assert result["quality_callback"] == {"captureQualityEventId": "cqe"}
    with pytest.raises(FileNotFoundError):  # no crops written on fail-closed
        store.get("org/o1/anomalies/s1/visual_crop.png")


def test_fail_closed_quality_payload_carries_sniffed_format(tmp_path):
    # A colorized TIFF: the decoder MATCHED (TIFF) but found no thermal band → NO_RADIOMETRIC_CHANNEL
    # with the sniffed format flowing through for observability (M2-1d/CR-25, M2-1f).
    store = LocalStorage(str(tmp_path))
    store.put("org/o1/ingest/s2/cap.tif", colorized_tiff())
    quality_posts = []
    process_session(
        ingestion_session_id="s2",
        organization_id="o1",
        raw_storage_path="local://org/o1/ingest/s2/cap.tif",
        storage=store,
        post=lambda p: None,
        post_quality=lambda p: quality_posts.append(p),
    )
    q = quality_posts[0]
    assert q["status"] == "NO_RADIOMETRIC_CHANNEL"
    assert q["detected_format"] == "RADIOMETRIC_TIFF"
    assert q["format_fingerprint"] == "TIFF"


# ---- committed synthetic radiometric TIFF fixture (M2-1e) — sniff -> TIFF decode -> real ΔT ---------
FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_radiometric.tiff"


def test_committed_radiometric_tiff_fixture_decodes_to_real_delta():
    d = detect(FIXTURE.read_bytes())
    assert isinstance(d, Detection)
    assert d.detected_format == "RADIOMETRIC_TIFF"      # sniff routed to the TIFF decoder
    assert d.radiometric is True and d.delta_provisional is False
    assert d.metric_delta == pytest.approx(35.0, abs=1.0)  # decoded 60°C hot block - 25°C baseline

# ---- M2-2b Part C: Shadowing -> data-quality (invalid inspection condition, not a fault) -----------
def _shadowing_cls():
    from app.classifier import Classification
    from app.iec_mapping import classify
    return Classification(label="Shadowing", confidence=0.99, iec=classify("Shadowing"))


def test_shadowing_routes_to_data_quality(monkeypatch):
    import app.detector as det
    monkeypatch.setattr(det, "classify_array", lambda *_a, **_k: _shadowing_cls())
    out = det.detect(radiometric_tiff(base_c=25.0, hot_c=30.0))
    assert isinstance(out, FailClosed)
    assert out.status == "INVALID_INSPECTION_CONDITION"
    # the DATA decoded fine (usable) — it is the CONDITION (shading) that is invalid.
    assert out.detected_format == "RADIOMETRIC_TIFF"


def test_process_session_shadowing_records_quality_not_anomaly(tmp_path, monkeypatch):
    import app.detector as det
    monkeypatch.setattr(det, "classify_array", lambda *_a, **_k: _shadowing_cls())
    store = LocalStorage(str(tmp_path))
    store.put("org/o1/ingest/s9/cap.tif", radiometric_tiff(base_c=25.0, hot_c=30.0))
    anomaly_posts, quality_posts = [], []
    result = process_session(
        ingestion_session_id="s9",
        organization_id="o1",
        raw_storage_path="local://org/o1/ingest/s9/cap.tif",
        storage=store,
        post=lambda p: anomaly_posts.append(p),
        post_quality=lambda p: quality_posts.append(p),
    )
    assert result["dispatched"] is False and result["status"] == "INVALID_INSPECTION_CONDITION"
    assert anomaly_posts == []            # no fault, no anomaly, no dispatch
    assert len(quality_posts) == 1 and quality_posts[0]["status"] == "INVALID_INSPECTION_CONDITION"
