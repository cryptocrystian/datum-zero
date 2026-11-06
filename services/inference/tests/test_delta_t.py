"""
M2-1c — real ΔT: ΔT = P99(hotspot region) − median(local baseline ring), from true °C (CR-24).

Deterministic, synthetic radiometric TIFF fixtures with known geometry. Proves the robustness the
measurement is chosen for: median baseline rejects field outliers; P99 hotspot rejects single-pixel
sensor spikes; a uniform frame degenerates to ΔT ≈ 0 (a VALID finding, not fail-closed); and the
served priority is monotonic in ΔT (CR-12).
"""
import io

import numpy as np
import pytest
from PIL import Image

from app.detector import Detection, detect


@pytest.fixture(autouse=True)
def _stable_classification(monkeypatch):
    # test_delta_t exercises the ΔT MEASUREMENT, not classification. Pin a stable non-data-quality
    # class so detect() does not reroute a synthetic frame the ONNX happens to call "Shadowing" (M2-2b).
    import app.detector as det
    from app.classifier import Classification
    from app.iec_mapping import classify

    monkeypatch.setattr(
        det, "classify_array",
        lambda *_a, **_k: Classification(label="Cell", confidence=0.9, iec=classify("Cell")),
    )


def _dn(celsius: float) -> int:
    return int(round((celsius + 273.15) * 100.0))


def radiometric_tiff(base_c, hot_c, shape=(240, 300), mutate=None) -> bytes:
    """Uniform base with one hot block (rows 100-130, cols 150-180). `mutate(arr)` may inject
    outliers/spikes before encoding."""
    arr = np.full(shape, _dn(base_c), dtype=np.uint16)
    arr[100:130, 150:180] = _dn(hot_c)
    if mutate is not None:
        mutate(arr)
    buf = io.BytesIO()
    # Pillow infers mode "I;16" from the uint16 dtype; the explicit mode= arg was removed in newer Pillow.
    Image.fromarray(arr).save(buf, format="TIFF")
    return buf.getvalue()


def uniform_tiff(c, shape=(200, 200)) -> bytes:
    arr = np.full(shape, _dn(c), dtype=np.uint16)
    buf = io.BytesIO()
    # Pillow infers mode "I;16" from the uint16 dtype; the explicit mode= arg was removed in newer Pillow.
    Image.fromarray(arr).save(buf, format="TIFF")
    return buf.getvalue()


def test_known_delta_t_from_hotspot_and_baseline():
    d = detect(radiometric_tiff(base_c=25.0, hot_c=60.0))  # P99(hot)=60, median(base)=25 → ΔT 35
    assert isinstance(d, Detection)
    assert d.metric_unit == "CELSIUS_DELTA"
    assert d.metric_delta == pytest.approx(35.0, abs=1.0)


def test_baseline_median_is_outlier_robust():
    # Inject a 20×20 block of extreme-COLD outliers into the baseline ring (outside the hotspot). It is
    # a small fraction of the field, so the MEDIAN baseline (hence ΔT) does not move — whereas a MEAN
    # baseline would be dragged down ~3 °C. Cold, so it never triggers the hot proposer / competes.
    def cold_block(arr):
        arr[55:75, 105:125] = _dn(-100.0)  # 400 px at −100 °C, inside the ring, outside the hot block

    clean = detect(radiometric_tiff(25.0, 60.0))
    noisy = detect(radiometric_tiff(25.0, 60.0, mutate=cold_block))
    assert abs(noisy.metric_delta - clean.metric_delta) <= 0.5


def test_hotspot_percentile_rejects_single_pixel_spike():
    # A lone super-hot pixel inside the hot block must NOT blow up T_hotspot (P99, not max).
    def spike(arr):
        arr[115, 165] = _dn(375.0)  # one extreme pixel (near the uint16 centi-Kelvin ceiling)

    clean = detect(radiometric_tiff(25.0, 60.0))
    spiked = detect(radiometric_tiff(25.0, 60.0, mutate=spike))
    assert spiked.metric_delta == pytest.approx(clean.metric_delta, abs=1.0)
    assert spiked.metric_delta < 100.0  # max would have yielded ΔT ≈ 350


def test_uniform_frame_is_degenerate_not_failclosed():
    d = detect(uniform_tiff(30.0))
    assert isinstance(d, Detection)  # radiometric-but-quiet is a VALID finding, not fail-closed
    assert d.metric_delta == pytest.approx(0.0, abs=0.5)
    # priority is no longer on the Detection (M2-2c/CR-30) — it is RuleSet client policy over the
    # objective grounded category, not a served ΔT fusion.
    assert not hasattr(d, "priority")
    assert d.grounded_iec_category in (1, 2, 3, None)


def test_delta_t_measurement_is_monotonic_in_hotspot_temperature():
    # Raising the hotspot temperature (fixed baseline) must never lower the measured ΔT.
    prev = -1.0
    for hot_c in (30.0, 40.0, 55.0, 70.0, 90.0):
        d = detect(radiometric_tiff(25.0, hot_c))
        assert isinstance(d, Detection)
        assert d.metric_delta >= prev - 0.5, "a higher hotspot temperature must not lower ΔT"
        prev = d.metric_delta
