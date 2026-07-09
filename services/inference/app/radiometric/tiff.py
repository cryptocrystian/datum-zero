"""
Radiometric TIFF decoder (M2-1a, CR-22). OPEN, unconditional — no proprietary dependency.

Non-FLIR OEM cores (InfiRay core, Autel 640T, ...) export a TIFF carrying a 16-bit thermal band. v1
applies the documented linear calibration below; per-OEM calibration refinement is a later ticket
(note it, don't build it). A colorized / 8-bit-only TIFF has no thermal band → fail closed.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

from .port import NoRadiometricChannel, RadiometricFormat

# v1 documented linear scale: 16-bit DN stored as centi-Kelvin (0.01 K / DN). T_C = raw·0.01 − 273.15.
KELVIN_PER_DN = 0.01
KELVIN_OFFSET = 273.15
_RADIOMETRIC_MODES = {"I", "I;16", "I;16B", "I;16L", "F"}
_TIFF_MAGIC = (b"II*\x00", b"MM\x00*")  # little-endian / big-endian TIFF headers


class RadiometricTiffDecoder:
    format = RadiometricFormat.RADIOMETRIC_TIFF

    def matches(self, image_bytes: bytes, exif: dict) -> bool:
        return image_bytes[:4] in _TIFF_MAGIC

    def decode(self, image_bytes: bytes, exif: dict) -> np.ndarray:
        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                mode = img.mode
                arr = np.asarray(img)
        except Exception as e:
            raise NoRadiometricChannel("unreadable TIFF") from e
        if mode not in _RADIOMETRIC_MODES or arr.ndim != 2:
            raise NoRadiometricChannel(f"TIFF carries no 16-bit thermal band (mode={mode})")
        return (arr.astype(np.float64) * KELVIN_PER_DN - KELVIN_OFFSET).astype(np.float32)
