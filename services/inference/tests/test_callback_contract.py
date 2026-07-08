"""
The inference side of the pinned callback contract. build_callback_payload's ACTUAL emitted payload
must validate against the SAME canonical schema the web callback validates against
(packages/adapters/contracts/inference-callback.schema.json) — so a field rename on this side fails
here, not in production.
"""
import json
from pathlib import Path

import jsonschema
import pytest

from app.detector import detect
from app.pipeline import build_callback_payload

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA = json.loads((REPO_ROOT / "packages/adapters/contracts/inference-callback.schema.json").read_text())
SAMPLE = (Path(__file__).resolve().parents[1] / "training/samples/Cell/4845.jpg").read_bytes()


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
