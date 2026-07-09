"""M2-2b (CR-29) — per-capture geometry validity. Deterministic; flag-not-drop; honest UNVERIFIED."""
import math

import pytest

from app.geometry import (
    MIN_PX_PER_CELL,
    VIEWING_ANGLE_MIN_DEG,
    geometry_status,
    module_normal,
    viewing_angle_deg,
)


def test_geometry_status_cases():
    # θ = 25° ≤ 30° → too grazing → EXCLUDED_ABSOLUTE (anomaly still recorded, category provisional).
    assert geometry_status(25.0, 10.0) == "EXCLUDED_ABSOLUTE"
    # gimbal/registry absent → viewing angle unknown → honest UNVERIFIED (never assumed valid).
    assert geometry_status(None, 10.0) == "UNVERIFIED"
    assert geometry_status(45.0, None) == "UNVERIFIED"
    # good viewing angle but sub-resolution → RESOLUTION_INSUFFICIENT.
    assert geometry_status(45.0, 3.0) == "RESOLUTION_INSUFFICIENT"
    # good angle + resolution → VERIFIED.
    assert geometry_status(45.0, 10.0) == "VERIFIED"


def test_bounds_are_provisional_defaults_and_config_driven():
    assert VIEWING_ANGLE_MIN_DEG == 30.0 and MIN_PX_PER_CELL == 5.0
    # a custom bound relaxes without touching the classifier.
    assert geometry_status(25.0, 10.0, min_angle_deg=20.0) == "VERIFIED"


def test_viewing_angle_geometry():
    up = (0.0, 0.0, 1.0)
    east = (1.0, 0.0, 0.0)
    # optical axis along the module normal → perpendicular view → θ = 90°.
    assert viewing_angle_deg(up, up) == pytest.approx(90.0, abs=1e-6)
    # optical axis in the module plane → grazing → θ = 0°.
    assert viewing_angle_deg(east, up) == pytest.approx(0.0, abs=1e-6)


def test_module_normal_flat_and_tilted():
    # flat panel (tilt 0) → normal points straight up.
    assert module_normal(0.0, 0.0) == pytest.approx((0.0, 0.0, 1.0), abs=1e-9)
    # 30° tilt facing east (az 90) → normal leans east, still mostly up.
    n = module_normal(30.0, 90.0)
    assert n[0] == pytest.approx(math.sin(math.radians(30.0)), abs=1e-9)  # east component
    assert n[2] == pytest.approx(math.cos(math.radians(30.0)), abs=1e-9)  # up component
