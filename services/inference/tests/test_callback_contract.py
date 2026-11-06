"""
The inference side of the pinned callback contract. build_callback_payload's ACTUAL emitted payload
must validate against the SAME canonical schema the web callback validates against
(packages/adapters/contracts/inference-callback.schema.json) — so a field rename on this side fails
here, not in production.
"""
import io
import json
from pathlib import Path

import jsonschema
import numpy as np
import pytest
from PIL import Image

from app.detector import detect
from app.pipeline import build_callback_payload

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA = json.loads((REPO_ROOT / "packages/adapters/contracts/inference-callback.schema.json").read_text())


def _radiometric_sample() -> bytes:
    # A synthetic 16-bit radiometric TIFF (centi-Kelvin container). detect() is radiometric-only now
    # (CR-23) — an 8-bit JPEG would fail closed and emit no payload to validate.
    arr = np.full((240, 300), int(round((27.0 + 273.15) * 100.0)), dtype=np.uint16)
    arr[100:130, 150:180] = int(round((57.0 + 273.15) * 100.0))
    buf = io.BytesIO()
    # Pillow infers mode "I;16" from the uint16 dtype; the explicit mode= arg was removed in newer Pillow.
    Image.fromarray(arr).save(buf, format="TIFF")
    return buf.getvalue()


SAMPLE = _radiometric_sample()


def _payload():
    return build_callback_payload(
        ingestion_session_id="s1",
        organization_id="o1",
        raw_storage_path="s3://datum-zero-dev/master/e2e.tif",
        detection=detect(SAMPLE),
        visual_crop_url="s3://datum-zero-dev/v",
        analytics_crop_url="s3://datum-zero-dev/a",
        latitude=None,
        longitude=None,
        captured_at="2026-07-05T18:00:00Z",
    )


def test_emitted_payload_matches_the_pinned_schema():
    jsonschema.validate(_payload(), SCHEMA)  # raises ValidationError on any mismatch


def test_a_renamed_field_fails_the_schema():
    p = _payload()
    p["detection"]["confidence"] = p["detection"].pop("confidence_score")  # rename → contract break
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(p, SCHEMA)
