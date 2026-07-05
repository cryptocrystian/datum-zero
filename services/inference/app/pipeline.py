"""
M0-05 inference pipeline: raw capture → deterministic detection → crops → evidence-only callback.

Flow: download the raw image via the StoragePort, run the thermal detector, write the crops back
through the StoragePort, build an EVIDENCE-ONLY payload (measurements only — no classification or
recommendation; that is M0-07), and POST it to the Next.js callback which persists the Anomaly
UNBOUND (CR-16). The engine never adjudicates and never emits verdict words (CR-12).
"""
from __future__ import annotations

import os
from typing import Any, Callable

from .detector import MODEL_VERSION, detect, render_crops
from .storage import StoragePort, get_storage, locator_to_key

# Fixture coordinates for the M0 sample — a point on the seeded APEX_SOLAR grid so M0-06 can bind
# it. Real captures carry lat/long from telemetry/EXIF; callers pass them in the process request.
SAMPLE_LATITUDE = 32.222780
SAMPLE_LONGITUDE = -110.974370

Poster = Callable[[dict[str, Any]], dict[str, Any]]


def build_callback_payload(
    *,
    ingestion_session_id: str,
    organization_id: str,
    raw_storage_path: str,
    detection,
    visual_crop_url: str,
    analytics_crop_url: str,
    latitude: float | None,
    longitude: float | None,
    captured_at: str | None,
) -> dict[str, Any]:
    """Assemble the evidence-only callback payload (snake_case on the wire, MANIFEST §3)."""
    lat = SAMPLE_LATITUDE if latitude is None else latitude
    lon = SAMPLE_LONGITUDE if longitude is None else longitude
    return {
        "ingestion_session_id": ingestion_session_id,
        "organization_id": organization_id,
        "model_version": MODEL_VERSION,
        "media_asset": {
            "full_storage_path": raw_storage_path,
            "captured_at": captured_at,  # used only if the MediaAsset must be created
        },
        "detection": {
            "confidence_score": detection.confidence_score,
            "metric_delta": detection.metric_delta,
            "metric_unit": detection.metric_unit,
            "bounding_box": detection.bounding_box,
            "latitude": f"{lat:.6f}",
            "longitude": f"{lon:.6f}",
            "z_axis_offset": None,
            "visual_crop_url": visual_crop_url,
            "analytics_crop_url": analytics_crop_url,
        },
    }


def _post_callback(payload: dict[str, Any]) -> dict[str, Any]:
    import httpx

    url = os.environ.get(
        "INFERENCE_CALLBACK_URL", "http://localhost:3000/api/v1/inference/callback"
    )
    token = os.environ.get("INFERENCE_CALLBACK_TOKEN")
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    resp = httpx.post(url, json=payload, headers=headers, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


def process_session(
    *,
    ingestion_session_id: str,
    organization_id: str,
    raw_storage_path: str,
    latitude: float | None = None,
    longitude: float | None = None,
    captured_at: str | None = None,
    storage: StoragePort | None = None,
    post: Poster | None = None,
) -> dict[str, Any]:
    """Run detection for one ingestion session and deliver the evidence to the callback."""
    store = storage or get_storage()
    poster = post or _post_callback

    image = store.get(locator_to_key(raw_storage_path))
    detection = detect(image)

    visual_bytes, analytics_bytes = render_crops(image)
    base = f"org/{organization_id}/anomalies/{ingestion_session_id}"
    visual_crop_url = store.put(f"{base}/visual_crop.bin", visual_bytes, "application/octet-stream")
    analytics_crop_url = store.put(
        f"{base}/analytics_crop.bin", analytics_bytes, "application/octet-stream"
    )

    payload = build_callback_payload(
        ingestion_session_id=ingestion_session_id,
        organization_id=organization_id,
        raw_storage_path=raw_storage_path,
        detection=detection,
        visual_crop_url=visual_crop_url,
        analytics_crop_url=analytics_crop_url,
        latitude=latitude,
        longitude=longitude,
        captured_at=captured_at,
    )
    callback_result = poster(payload)
    return {"payload": payload, "callback": callback_result}
