"""
Datum Zero — Inference service (FastAPI).

Role (MANIFEST §2): consume an ingestion event, decode true per-pixel °C (RadiometricPort), run the
thermal detector, compute the ΔT, crop, then POST an EVIDENCE-ONLY result to the Next.js callback. The
engine MEASURES + CLASSIFIES against the standard and NEVER adjudicates (CR-12). It FAILS CLOSED on a
capture with no usable radiometric channel — no fabricated measurement, no dispatch (CR-22/CR-23).
"""
from datetime import datetime, timezone

from fastapi import FastAPI, status
from pydantic import BaseModel

from .pipeline import process_session

app = FastAPI(title="Datum Zero Inference", version="0.0.0")


@app.get("/health")
def health() -> dict:
    """Liveness probe for the inference tier."""
    return {"status": "ok", "service": "inference", "ts": datetime.now(timezone.utc).isoformat()}


class ProcessRequest(BaseModel):
    ingestion_session_id: str
    organization_id: str
    raw_storage_path: str
    # Capture coordinates from telemetry/EXIF (fixture defaults applied downstream if omitted).
    latitude: float | None = None
    longitude: float | None = None
    captured_at: str | None = None


@app.post("/internal/process", status_code=status.HTTP_202_ACCEPTED)
def process(req: ProcessRequest) -> dict:
    """
    Run the deterministic thermal detector for an ingestion session on true decoded °C, write crops
    through the StoragePort, and POST the evidence-only payload to the Next.js callback, which creates
    the Anomaly UNBOUND (CR-16).

    Fails closed (CR-22/CR-23): a capture with no usable radiometric channel yields NO anomaly — the
    response carries a `data_quality` outcome (status + reason + EXIF maker/model) instead. That is a
    session data-quality failure, not a PENDING_QA anomaly (operator surfacing is M2-1d/M2-1f).
    """
    result = process_session(
        ingestion_session_id=req.ingestion_session_id,
        organization_id=req.organization_id,
        raw_storage_path=req.raw_storage_path,
        latitude=req.latitude,
        longitude=req.longitude,
        captured_at=req.captured_at,
    )
    if not result.get("dispatched"):
        return {
            "accepted": True,
            "ingestion_session_id": req.ingestion_session_id,
            "anomaly": None,
            "data_quality": {
                "status": result["status"],
                "reason": result["reason"],
                "manufacturer": result["manufacturer"],
                "model": result["model"],
            },
        }
    return {
        "accepted": True,
        "ingestion_session_id": req.ingestion_session_id,
        "anomaly": result["callback"],
    }
