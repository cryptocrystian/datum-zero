"""
Guardrail — the AWS SDK (boto3/botocore) is confined to the inference StoragePort seam.

Parity with the TS storage-seam guardrail (test_ingestion_airframe_binding.py) that keeps
`@aws-sdk` out of everything but `packages/storage`. Here, only `services/inference/app/storage.py`
may import boto3/botocore; the rest of the service goes through the StoragePort abstraction so the
storage backend stays swappable (local fallback) and the seam stays single (MANIFEST §3).

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INFERENCE = ROOT / "services/inference"
SEAM = INFERENCE / "app/storage.py"

# Matches `import boto3`, `import botocore...`, `from boto3 ... import`, `from botocore ... import`.
SDK_IMPORT = re.compile(r"^\s*(?:import|from)\s+(?:boto3|botocore)\b", re.M)


def test_storage_seam_imports_boto3():
    assert SEAM.exists(), "inference StoragePort seam missing"
    assert SDK_IMPORT.search(SEAM.read_text()), "the storage seam should be the one place boto3 lives"


def test_boto3_confined_to_storage_seam():
    offenders = []
    for f in INFERENCE.rglob("*.py"):
        parts = set(f.parts)
        if ".venv" in parts or "__pycache__" in parts or "build" in parts:
            continue
        if f.resolve() == SEAM.resolve():
            continue
        if SDK_IMPORT.search(f.read_text(errors="ignore")):
            offenders.append(str(f.relative_to(ROOT)))
    assert not offenders, (
        "boto3/botocore must be confined to services/inference/app/storage.py (StoragePort seam); "
        "direct import(s) found in:\n" + "\n".join(offenders)
    )
