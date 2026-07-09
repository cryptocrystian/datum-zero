"""
M2-1a — RadiometricPort registry tests. Deterministic + no proprietary imagery in the repo.

FLIR correctness is split from parsing: the always-run gate is the pure Planck function; the flyr
extraction is exercised against a real sample only if one is present locally (skipped in CI).
"""
import io
import math
import os
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.radiometric import (
    ParseStatus,
    RadiometricFormat,
    build_default_port,
    extract_exif,
    planck_raw_to_celsius,
)
from app.radiometric import dji as dji_mod


# ---- synthetic fixtures (no proprietary formats hand-crafted) --------------------------------------
def jpeg_with_make(make: str, model: str | None = None) -> bytes:
    img = Image.new("RGB", (8, 8), (120, 10, 10))
    exif = img.getexif()
    exif[0x010F] = make  # Make
    if model:
        exif[0x0110] = model  # Model
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def tiff16(raw_value: int, shape=(4, 4)) -> bytes:
    arr = np.full(shape, raw_value, dtype=np.uint16)
    buf = io.BytesIO()
    Image.fromarray(arr, mode="I;16").save(buf, format="TIFF")
    return buf.getvalue()


def tiff8_colorized() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), (10, 20, 30)).save(buf, format="TIFF")  # 8-bit, no thermal band
    return buf.getvalue()


def plain_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (0, 0, 0)).save(buf, format="JPEG")
    return buf.getvalue()


# ---- (a) FLIR pure Planck — always-run correctness gate (no flyr, no binary) -----------------------
def test_planck_raw_to_celsius_hand_computed():
    r1, b, f, o, r2 = 17096.453, 1428.0, 1.0, -70.0, 0.0155
    raw = np.array([[10000, 20000], [15000, 25000]], dtype=np.float64)
    out = planck_raw_to_celsius(raw, r1, b, f, o, r2)
    expected = np.array(
        [[b / math.log(r1 / (r2 * (v + o)) + f) - 273.15 for v in row] for row in raw],
        dtype=np.float32,
    )
    assert out.dtype == np.float32
    assert np.allclose(out, expected, atol=0.02)


# ---- (b) FLIR flyr extraction — integration only, skipped when no sample present --------------------
FLIR_SAMPLE = Path(os.environ.get("FLIR_SAMPLE_PATH", str(Path(__file__).parent / "fixtures" / "flir_sample.jpg")))


@pytest.mark.skipif(not FLIR_SAMPLE.exists(), reason="no FLIR sample present (proprietary/licensing) — local integration only")
def test_flir_flyr_extraction_integration():
    res = build_default_port().read_temperature(FLIR_SAMPLE.read_bytes())
    assert res.status == ParseStatus.OK
    assert res.detected_format == RadiometricFormat.FLIR_RJPEG
    assert res.temperature_c is not None and res.temperature_c.ndim == 2


def test_flir_maker_without_thermal_fails_closed():
    # A FLIR-maker JPEG with no raw thermal payload: matches FLIR, flyr finds nothing → fail closed.
    res = build_default_port().read_temperature(jpeg_with_make("FLIR Systems AB"))
    assert res.status == ParseStatus.NO_RADIOMETRIC_CHANNEL
    assert res.detected_format == RadiometricFormat.FLIR_RJPEG
    assert res.temperature_c is None


# ---- radiometric TIFF ------------------------------------------------------------------------------
def test_tiff_decode_known_values():
    res = build_default_port().read_temperature(tiff16(30015))  # 300.15 K → 27.00 °C
    assert res.status == ParseStatus.OK
    assert res.detected_format == RadiometricFormat.RADIOMETRIC_TIFF
    assert res.temperature_c is not None and res.temperature_c.dtype == np.float32
    assert np.allclose(res.temperature_c, 27.0, atol=0.01)


# ---- DJI (mocked DIRP boundary — no SDK, no sample) ------------------------------------------------
def test_dji_mocked_dirp(monkeypatch):
    known = np.array([[250, 305], [180, 400]], dtype=np.uint16)  # per-pixel 0.1 °C
    monkeypatch.setattr(dji_mod, "_dirp_deci_celsius", lambda image_bytes: known)
    res = build_default_port().read_temperature(jpeg_with_make("DJI"))
    assert res.status == ParseStatus.OK
    assert res.detected_format == RadiometricFormat.DJI_RJPEG
    assert np.allclose(res.temperature_c, known.astype(np.float32) / 10.0)  # ÷10 → °C


# ---- sniff routing ---------------------------------------------------------------------------------
def test_sniff_routes_each_format():
    port = build_default_port()
    cases = [
        (jpeg_with_make("FLIR Systems AB"), RadiometricFormat.FLIR_RJPEG),
        (tiff16(30000), RadiometricFormat.RADIOMETRIC_TIFF),
        (jpeg_with_make("DJI"), RadiometricFormat.DJI_RJPEG),
        (plain_jpeg(), None),
    ]
    for image, want in cases:
        assert port.sniff(image, extract_exif(image)) == want


# ---- fail-closed -----------------------------------------------------------------------------------
def test_colorized_only_is_no_radiometric_channel():
    res = build_default_port().read_temperature(tiff8_colorized())
    assert res.status == ParseStatus.NO_RADIOMETRIC_CHANNEL
    assert res.detected_format == RadiometricFormat.RADIOMETRIC_TIFF
    assert res.temperature_c is None


def test_unrecognized_format_is_unknown():
    res = build_default_port().read_temperature(plain_jpeg())
    assert res.status == ParseStatus.UNKNOWN_FORMAT
    assert res.detected_format is None
    assert res.temperature_c is None


def test_manufacturer_model_captured_even_on_failure():
    # DJI image with the SDK absent (CI) → fail closed, but EXIF maker/model still captured (M2-1f).
    res = build_default_port().read_temperature(jpeg_with_make("DJI", "Zenmuse H20T"))
    assert res.status == ParseStatus.NO_RADIOMETRIC_CHANNEL
    assert res.detected_format == RadiometricFormat.DJI_RJPEG
    assert res.manufacturer is not None and "DJI" in res.manufacturer.upper()
    assert res.model == "Zenmuse H20T"
