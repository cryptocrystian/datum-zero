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


# /internal/process now runs the real pipeline (storage + callback); it is covered end-to-end by
# test_detector.py::test_process_session_pipeline_with_local_storage.
