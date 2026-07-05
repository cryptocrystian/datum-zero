"""
Datum Zero — Inference service (FastAPI).

Role (MANIFEST §2): consume an ingestion event, run the thermal detector, compute metricDelta,
crop, then POST an EVIDENCE-ONLY result to the Next.js callback. The engine MEASURES only — it
never classifies against a standard (that is M0-07) and NEVER adjudicates (CR-12).
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
    M0-05: run the deterministic thermal detector for an ingestion session, write crops through
    the StoragePort, and POST the evidence-only payload to the Next.js callback, which creates the
    Anomaly UNBOUND (CR-16). No classification/recommendation here (M0-07).
    """
    result = process_session(
        ingestion_session_id=req.ingestion_session_id,
        organization_id=req.organization_id,
        raw_storage_path=req.raw_storage_path,
        latitude=req.latitude,
        longitude=req.longitude,
        captured_at=req.captured_at,
    )
    return {
        "accepted": True,
        "ingestion_session_id": req.ingestion_session_id,
        "anomaly": result["callback"],
    }
