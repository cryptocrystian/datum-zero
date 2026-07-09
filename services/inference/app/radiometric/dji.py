"""
DJI R-JPEG radiometric decoder (M2-1a, CR-22). PROPRIETARY — license-conditioned (DJI EULA §14).

This module is GLUE ONLY — DJI maker sniff + the documented ÷10 (0.1 °C → °C) conversion + a boundary.
It contains NO DJI SDK code. The real DIRP call lives in a CONFIDENTIAL wrapper (`_dji_sdk_native`)
loaded at runtime from an env-configured vendored path — NEVER committed (gitignored, guardrail-enforced),
mirroring the secrets posture. The DJI decoder runs ONLY on DJI-captured imagery, calls the SDK as-is
(no modification/reverse-engineering). In CI the SDK is absent, so tests mock the DIRP boundary.
"""
from __future__ import annotations

import numpy as np

from .port import NoRadiometricChannel, RadiometricFormat

# Env var pointing at the vendored, never-committed DJI Thermal SDK wrapper (documented in the service
# README, not the repo). Referencing it by path mirrors how secrets resolve via secretVaultKey.
DJI_SDK_PATH_ENV = "DJI_THERMAL_SDK_PATH"


class DjiSdkUnavailable(NoRadiometricChannel):
    """The confidential DJI Thermal SDK wrapper is not present (absent in CI/OSS). Fail closed."""


def _dirp_deci_celsius(image_bytes: bytes) -> np.ndarray:
    """DIRP boundary → per-pixel Uint16 in 0.1 °C. Delegates to the confidential, env-pathed SDK
    wrapper, which is never committed. Absent (CI/OSS) → fail closed. Tests mock THIS function."""
    try:
        from . import _dji_sdk_native  # confidential wrapper — gitignored, absent in CI/OSS
    except Exception as e:  # noqa: BLE001 — any import failure means the SDK is unavailable
        raise DjiSdkUnavailable(
            f"DJI Thermal SDK wrapper not available; vendor it and set ${DJI_SDK_PATH_ENV} (CR-22)."
        ) from e
    return np.asarray(_dji_sdk_native.measure_deci_celsius(image_bytes))


class DjiRjpegDecoder:
    format = RadiometricFormat.DJI_RJPEG

    def matches(self, image_bytes: bytes, exif: dict) -> bool:
        if image_bytes[:2] != b"\xff\xd8":  # DJI radiometric is an R-JPEG container
            return False
        return "DJI" in str(exif.get("Make") or "").upper()

    def decode(self, image_bytes: bytes, exif: dict) -> np.ndarray:
        deci = np.asarray(_dirp_deci_celsius(image_bytes))  # Uint16, 0.1 °C
        if deci.ndim != 2 or deci.size == 0:
            raise NoRadiometricChannel("DJI DIRP returned no thermal array")
        return (deci.astype(np.float32) / 10.0)  # 0.1 °C → °C
