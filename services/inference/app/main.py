"""
Datum Zero — Inference service (FastAPI).

Role (MANIFEST §2): consume an ingestion event, run CV detection, classify against the standard's
matrix (CR-15), compute metricDelta, crop, spatial-bind, then POST an evidence-framed result to the
Next.js callback. This scaffold exposes /health and a stubbed processing endpoint; real detection
lands in M0-05. The engine detects + classifies only — it NEVER adjudicates (CR-12).
"""
from datetime import datetime, timezone

from fastapi import FastAPI, status
from pydantic import BaseModel

app = FastAPI(title="Datum Zero Inference", version="0.0.0")


@app.get("/health")
def health() -> dict:
    """Liveness probe for the inference tier."""
    return {"status": "ok", "service": "inference", "ts": datetime.now(timezone.utc).isoformat()}


class ProcessRequest(BaseModel):
    ingestion_session_id: str
    organization_id: str
    raw_storage_path: str


@app.post("/internal/process", status_code=status.HTTP_202_ACCEPTED)
def process(req: ProcessRequest) -> dict:
    """
    Stub (M0-05): enqueue/execute detection for an ingestion session.
    Real implementation runs the thermal detector, classifies per IEC TS 62446-3,
    then POSTs the evidence payload to INFERENCE_CALLBACK_URL. Returns 202 for now.
    """
    return {"accepted": True, "ingestion_session_id": req.ingestion_session_id}
