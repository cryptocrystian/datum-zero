"""
Guardrail — the inference→web callback seam is pinned by ONE canonical schema, validated on BOTH
sides (the graph-flagged seam with no code-level edge between Python and TS).

Asserts:
  • the canonical schema exists and is valid JSON;
  • the web callback validates the INBOUND payload against it at runtime (fails closed);
  • both sides reference the SAME schema file (adapters validator imports it; a Python test validates
    the emitted payload against it) — so a field rename on either side fails a test, not production.

Run: pytest tests/guardrails -q
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "packages/adapters/contracts/inference-callback.schema.json"
VALIDATOR = ROOT / "packages/adapters/src/inference-callback.ts"
INDEX = ROOT / "packages/adapters/src/index.ts"
ROUTE = ROOT / "apps/web/app/api/v1/inference/callback/route.ts"
PY_TEST = ROOT / "services/inference/tests/test_callback_contract.py"
TS_TEST = ROOT / "apps/web/lib/inference/callback-contract.test.ts"


def test_schema_present_and_valid():
    data = json.loads(SCHEMA.read_text())
    assert data["title"].startswith("Datum Zero"), "unexpected contract title"
    assert "detection" in data["properties"], "schema must describe the detection payload"
    assert data["additionalProperties"] is False, "the contract must reject unknown top-level fields (pin)"


def test_web_validates_inbound_against_the_schema():
    v = VALIDATOR.read_text()
    assert "inference-callback.schema.json" in v, "the validator must compile the canonical schema"
    assert "validateInferenceCallback" in INDEX.read_text(), "@dz/adapters must export the validator"
    route = ROUTE.read_text()
    assert "validateInferenceCallback" in route, "the callback route must validate the inbound payload (fail closed)"


def test_both_sides_test_the_same_schema():
    assert PY_TEST.exists(), "the inference side must validate its emitted payload against the schema"
    assert "inference-callback.schema.json" in PY_TEST.read_text(), "python test must load the canonical schema"
    assert TS_TEST.exists(), "the web side must validate a sample against the schema"
    assert "validateInferenceCallback" in TS_TEST.read_text(), "web test must exercise the shared validator"
