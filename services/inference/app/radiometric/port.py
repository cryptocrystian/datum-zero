"""
RadiometricPort — manufacturer-agnostic radiometric decode registry (M2-1a, CR-22).

Turns a radiometric capture into a TRUE per-pixel temperature array (°C) by sniffing the format and
routing to a registered decoder. FAILS CLOSED: an unknown format or a non-radiometric (colorized-only)
input never guesses a format and never fabricates temperature.

This ticket (M2-1a) delivers the decode capability in ISOLATION — it is NOT wired into the live
pipeline (detector.py `_load_frame`/`_delta_t` still use the M0 placeholder). Channel-preservation
(M2-1b), real ΔT (M2-1c), the Validator tie-in (M2-1d), the e2e DoD (M2-1e), and unknown-format
observability (M2-1f) are separate tickets.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from enum import Enum
from typing import Protocol, runtime_checkable

import numpy as np
from PIL import ExifTags, Image


class RadiometricFormat(str, Enum):
    FLIR_RJPEG = "FLIR_RJPEG"
    RADIOMETRIC_TIFF = "RADIOMETRIC_TIFF"
    DJI_RJPEG = "DJI_RJPEG"


class ParseStatus(str, Enum):
    OK = "OK"
    NO_RADIOMETRIC_CHANNEL = "NO_RADIOMETRIC_CHANNEL"  # matched a format but no/corrupt thermal payload
    UNKNOWN_FORMAT = "UNKNOWN_FORMAT"                  # no registered decoder matched (feeds M2-1f)


class NoRadiometricChannel(Exception):
    """A decoder matched a format but found no usable per-pixel thermal payload (e.g. a colorized-only
    export, or a corrupt/unavailable thermal channel). Fail closed — never fabricate temperature."""


@dataclass(frozen=True)
class RadiometricResult:
    status: ParseStatus
    temperature_c: np.ndarray | None       # 2-D float32, °C; None unless status == OK
    detected_format: RadiometricFormat | None
    manufacturer: str | None               # from EXIF; captured even on failure (observability, M2-1f)
    model: str | None


@runtime_checkable
class RadiometricDecoder(Protocol):
    format: RadiometricFormat
    def matches(self, image_bytes: bytes, exif: dict) -> bool: ...   # sniff: magic bytes / EXIF maker / container
    def decode(self, image_bytes: bytes, exif: dict) -> np.ndarray: ...  # → °C array; raises NoRadiometricChannel


def _s(v: object) -> str | None:
    if v is None:
        return None
    if isinstance(v, bytes):
        return v.decode("utf-8", "ignore").strip("\x00 ").strip() or None
    return str(v).strip() or None


def extract_exif(image_bytes: bytes) -> dict:
    """Read the EXIF once, keyed by human tag name (Make, Model, ...). Best-effort — never raises."""
    exif: dict = {}
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            for tag_id, val in img.getexif().items():
                exif[ExifTags.TAGS.get(tag_id, str(tag_id))] = val
    except Exception:
        pass
    return exif


class RadiometricPort:
    def __init__(self, decoders: list[RadiometricDecoder]):
        self._decoders = list(decoders)

    def sniff(self, image_bytes: bytes, exif: dict) -> RadiometricFormat | None:
        for d in self._decoders:
            try:
                if d.matches(image_bytes, exif):
                    return d.format
            except Exception:
                continue  # a broken sniffer never blocks the registry — fail closed to "no match"
        return None

    def read_temperature(self, image_bytes: bytes) -> RadiometricResult:
        """EXIF once → sniff (first matching decoder) → decode → wrap. Fail closed on every path."""
        exif = extract_exif(image_bytes)
        manufacturer, model = _s(exif.get("Make")), _s(exif.get("Model"))

        for d in self._decoders:
            try:
                matched = d.matches(image_bytes, exif)
            except Exception:
                matched = False
            if not matched:
                continue
            try:
                temp = d.decode(image_bytes, exif)
            except NoRadiometricChannel:
                return RadiometricResult(ParseStatus.NO_RADIOMETRIC_CHANNEL, None, d.format, manufacturer, model)
            arr = np.asarray(temp, dtype=np.float32)
            return RadiometricResult(ParseStatus.OK, arr, d.format, manufacturer, model)

        # No registered decoder matched — the M2-1f observability signal.
        return RadiometricResult(ParseStatus.UNKNOWN_FORMAT, None, None, manufacturer, model)


def build_default_port() -> RadiometricPort:
    """Default registry. Sniff order: FLIR, radiometric-TIFF, DJI (specific makers before generic
    containers). Imported lazily so the package loads without flyr / the DJI SDK present."""
    from .dji import DjiRjpegDecoder
    from .flir import FlirRjpegDecoder
    from .tiff import RadiometricTiffDecoder

    return RadiometricPort([FlirRjpegDecoder(), RadiometricTiffDecoder(), DjiRjpegDecoder()])
