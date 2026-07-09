"""
Inference pipeline: raw capture → real detection (DET-1b on true °C) → crops → callback.

Flow: download the RAW radiometric capture via the StoragePort (source of record, byte-for-byte —
CR-22), run the detector (RadiometricPort decode → hotspot proposer + DET-1a classifier + ΔT), write
the ACTUAL pixel crops back through the StoragePort as SEPARATE display assets (the detector never
reads them), build the callback payload, and POST it to the Next.js callback which persists the
Anomaly UNBOUND (CR-16).

Fail closed (CR-22/CR-23): if the capture has no usable radiometric channel (unknown format or
colorized-only), `detect()` returns a `FailClosed` — the pipeline does NOT fabricate a measurement,
does NOT write crops, and does NOT POST an anomaly. Instead it records the outcome via the DISTINCT
capture-quality callback (M2-1d, CR-25) and returns a structured data-quality result. This is a
session data-quality failure, not a PENDING_QA anomaly; the unknown-format QA event is M2-1f.

The payload carries the MEASUREMENT layer (box, ΔT, confidence, crops) AND the standards
CLASSIFICATION the model raises (class + IEC TS 62446-3 category + priority) — all evidence-framed, no
verdict words (CR-12). The model raises candidates; the human QA gate still adjudicates every dispatch
(CR-12). The callback CONTRACT is unchanged.
"""
from __future__ import annotations

import os
from typing import Any, Callable

from .detector import MODEL_VERSION, FailClosed, detect, render_crops
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
    """Assemble the callback payload (snake_case on the wire, MANIFEST §3). Measurement fields
    (M0-05 contract) plus the DET-1b standards classification the model raises — evidence-framed."""
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
            # measurement / evidence layer (unchanged contract fields)
            "confidence_score": detection.confidence_score,
            "metric_delta": detection.metric_delta,
            "metric_unit": detection.metric_unit,
            "bounding_box": detection.bounding_box,
            # standards classification the model raises (model proposes; CR-12 human gate decides)
            "class_label": detection.class_label,
            "iec_category": detection.iec_category,
            "priority": detection.priority,
            "classification": detection.classification,
            "standard_ref": detection.standard_ref,
            # provenance flags (radiometric always True; delta_provisional retained at False, CR-23)
            "radiometric": detection.radiometric,
            "delta_provisional": detection.delta_provisional,
            "latitude": f"{lat:.6f}",
            "longitude": f"{lon:.6f}",
            "z_axis_offset": None,
            "visual_crop_url": visual_crop_url,
            "analytics_crop_url": analytics_crop_url,
        },
    }


def _post_to(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    import httpx

    token = os.environ.get("INFERENCE_CALLBACK_TOKEN")
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    resp = httpx.post(url, json=payload, headers=headers, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


def _post_callback(payload: dict[str, Any]) -> dict[str, Any]:
    return _post_to(
        os.environ.get("INFERENCE_CALLBACK_URL", "http://localhost:3000/api/v1/inference/callback"),
        payload,
    )


def _post_quality(payload: dict[str, Any]) -> dict[str, Any]:
    """Deliver the data-quality outcome to the DISTINCT capture-quality callback (M2-1d, CR-25) —
    never the anomaly callback. Same shared-secret posture."""
    return _post_to(
        os.environ.get(
            "INFERENCE_QUALITY_CALLBACK_URL",
            "http://localhost:3000/api/v1/inference/capture-quality",
        ),
        payload,
    )


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
    post_quality: Poster | None = None,
) -> dict[str, Any]:
    """Run detection for one ingestion session and deliver the evidence to the callback.

    On a usable radiometric capture: writes crops + POSTs the anomaly payload, returns
    ``{"status": "OK", "dispatched": True, "payload", "callback"}``.
    Fail closed on no usable radiometric channel: NO crops, NO anomaly POST — POSTs the data-quality
    outcome to the capture-quality callback (M2-1d, CR-25) and returns ``{"status": <parse status>,
    "dispatched": False, "reason", "manufacturer", "model", "detected_format", "payload": None,
    "callback": None, "quality_payload", "quality_callback"}`` (CR-22/CR-23)."""
    store = storage or get_storage()
    poster = post or _post_callback
    quality_poster = post_quality or _post_quality

    image = store.get(locator_to_key(raw_storage_path))
    outcome = detect(image)

    if isinstance(outcome, FailClosed):
        # No usable radiometric channel — do NOT fabricate, do NOT write crops, do NOT dispatch an
        # anomaly (CR-22/CR-23). Record it as a data-quality event via the DISTINCT capture-quality
        # callback (M2-1d, CR-25). The reason is derived operator-side (single source of truth).
        quality_payload = {
            "ingestion_session_id": ingestion_session_id,
            "organization_id": organization_id,
            "status": outcome.status,
            "manufacturer": outcome.manufacturer,
            "model": outcome.model,
            "detected_format": outcome.detected_format,
            "format_fingerprint": outcome.format_fingerprint,
        }
        quality_result = quality_poster(quality_payload)
        return {
            "status": outcome.status,
            "dispatched": False,
            "reason": outcome.reason,
            "manufacturer": outcome.manufacturer,
            "model": outcome.model,
            "detected_format": outcome.detected_format,
            "ingestion_session_id": ingestion_session_id,
            "organization_id": organization_id,
            "payload": None,
            "callback": None,
            "quality_payload": quality_payload,
            "quality_callback": quality_result,
        }

    detection = outcome
    visual_bytes, analytics_bytes = render_crops(image, detection.bounding_box)
    base = f"org/{organization_id}/anomalies/{ingestion_session_id}"
    visual_crop_url = store.put(f"{base}/visual_crop.png", visual_bytes, "image/png")
    analytics_crop_url = store.put(f"{base}/analytics_crop.png", analytics_bytes, "image/png")

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
    return {"status": "OK", "dispatched": True, "payload": payload, "callback": callback_result}
