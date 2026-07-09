"""
Guardrail (pipeline-level) — the detector decodes true °C via the RadiometricPort and FAILS CLOSED,
and no pipeline path fabricates a measurement or dispatches an anomaly when the capture has no usable
radiometric channel (M2-1b, CR-22/CR-23). This complements M2-1a's decoder-level DJI guard.

Static source assertions (the root guardrail interpreter has no numpy/PIL to import the app).

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INF = ROOT / "services/inference"
DETECTOR = (INF / "app/detector.py").read_text()
PIPELINE = (INF / "app/pipeline.py").read_text()


def test_detector_decodes_via_radiometric_port():
    assert "read_temperature" in DETECTOR and "build_default_port" in DETECTOR, \
        "detector must decode °C via the RadiometricPort (CR-22), not a PIL-mode heuristic"


def test_intensity_proxy_and_placeholder_are_retired():
    # CR-23: the fabricated 8-bit ΔT proxy and the PIL-mode 'radiometric' heuristic are gone.
    assert "intensity_celsius_per_dn" not in DETECTOR, "CR-23: the intensity-proxy ΔT must be retired"
    assert "_RADIOMETRIC_MODES" not in DETECTOR, "CR-23: the PIL-mode radiometric heuristic must be gone"
    assert "def _load_frame" not in DETECTOR, "the M0 _load_frame placeholder function must be removed (M2-1b)"


def test_detector_returns_a_fail_closed_outcome():
    assert "FailClosed" in DETECTOR, "detector must return a fail-closed outcome on a non-OK decode"
    assert "ParseStatus.OK" in DETECTOR, "detector must branch on the parse status"


def test_pipeline_does_not_dispatch_on_fail_closed():
    # No crops, no payload, no POST when read_temperature() != OK — the guard must return FIRST.
    assert "FailClosed" in PIPELINE, "pipeline must guard on the fail-closed outcome"
    guard = PIPELINE.index("isinstance(outcome, FailClosed)")
    put = PIPELINE.index("store.put(")
    post = PIPELINE.index("poster(payload)")
    assert guard < put and guard < post, \
        "the fail-closed guard must return BEFORE writing crops or POSTing (no dispatch on bad data)"
