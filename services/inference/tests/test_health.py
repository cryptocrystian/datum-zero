"""
Smoke tests for the inference service scaffold.

Keeps `pytest services/inference` meaningful and green from M0-01 onward; the real
detector tests land with M0-05. Detect + classify only — never adjudicate (CR-12).
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "inference"


def test_process_accepts_session():
    res = client.post(
        "/internal/process",
        json={
            "ingestion_session_id": "00000000-0000-0000-0000-000000000001",
            "organization_id": "00000000-0000-0000-0000-000000000001",
            "raw_storage_path": "s3://datum-zero-dev/org/x/ingest/y/capture.tiff",
        },
    )
    assert res.status_code == 202
    assert res.json()["accepted"] is True
