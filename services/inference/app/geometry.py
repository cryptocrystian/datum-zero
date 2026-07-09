"""
Per-capture geometry validity (M2-2b, CR-29) — pure, deterministic, dependency-free.

IEC TS 62446-3 constrains the CAPTURE GEOMETRY under which an absolute-temperature / ΔT reading is
trustworthy: the viewing angle must not be too grazing, and the resolution must resolve a cell. These
ADDITIVELY flag the affected anomaly (they do NOT drop it — a real defect may still be present; the
human gate adjudicates). Honest fallback: computing the viewing angle needs gimbal attitude (capture
EXIF/XMP) AND module-plane orientation (rack tilt/azimuth from the registry) — if either is absent the
status is UNVERIFIED, never assumed-valid. Bounds are PROVISIONAL pending IEC TS 62446-3:2017 Table 3.
"""
from __future__ import annotations

import math

# θ = angle between the optical axis and the MODULE PLANE; must EXCEED this (≤ → too grazing).
VIEWING_ANGLE_MIN_DEG = 30.0
# ≥ 5×5 px/cell (~3 cm/px) to resolve a cell-level abnormality.
MIN_PX_PER_CELL = 5.0

Vec3 = tuple[float, float, float]


def module_normal(tilt_deg: float, azimuth_deg: float) -> Vec3:
    """Outward module-face normal (E, N, Up) from rack tilt (from horizontal) + azimuth (compass, the
    direction the panel faces). Pure."""
    t, a = math.radians(tilt_deg), math.radians(azimuth_deg)
    return (math.sin(t) * math.sin(a), math.sin(t) * math.cos(a), math.cos(t))


def viewing_angle_deg(optical_axis: Vec3, module_normal_vec: Vec3) -> float:
    """θ (deg) between the optical axis and the module PLANE: 90° = perpendicular (ideal), 0° = grazing.
    θ = 90 − incidence, where incidence = angle(axis, normal). Direction-agnostic (uses |cos|). Pure."""
    def dot(u: Vec3, v: Vec3) -> float:
        return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]

    na = math.sqrt(dot(optical_axis, optical_axis))
    nn = math.sqrt(dot(module_normal_vec, module_normal_vec))
    if na == 0.0 or nn == 0.0:
        return 0.0
    cos_inc = min(1.0, max(-1.0, abs(dot(optical_axis, module_normal_vec)) / (na * nn)))
    return 90.0 - math.degrees(math.acos(cos_inc))


def geometry_status(
    viewing_angle: float | None,
    px_per_cell: float | None,
    *,
    min_angle_deg: float = VIEWING_ANGLE_MIN_DEG,
    min_px_per_cell: float = MIN_PX_PER_CELL,
) -> str:
    """Per-capture geometry flag. Honest UNVERIFIED when inputs are absent; EXCLUDED_ABSOLUTE when the
    view is too grazing (θ ≤ min); RESOLUTION_INSUFFICIENT when below px/cell; else VERIFIED. These are
    FLAGS — they never drop the anomaly on their own (the human QA gate adjudicates)."""
    if viewing_angle is None:
        return "UNVERIFIED"  # gimbal attitude and/or module orientation absent
    if viewing_angle <= min_angle_deg:
        return "EXCLUDED_ABSOLUTE"  # too grazing — unreliable for absolute-temperature evaluation
    if px_per_cell is None:
        return "UNVERIFIED"
    if px_per_cell < min_px_per_cell:
        return "RESOLUTION_INSUFFICIENT"
    return "VERIFIED"
