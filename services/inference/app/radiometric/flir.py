"""
FLIR R-JPEG radiometric decoder (M2-1a, CR-22). OPEN — pure-Python, no system binary.

Extraction backend is `flyr` (EUPL-1.2), a pure-Python reimplementation of the FLIR thermal parse. It
is used UNMODIFIED — wrapped, never forked; all Datum Zero logic stays outside `flyr` (recorded in
docs/LEGAL-REVIEW-BACKLOG.md — fine for the SaaS backend, revisit before on-prem/edge distribution).
The extraction sits behind a small `_extract` boundary so a different backend (e.g. an exiftool
subprocess for FLIR variants `flyr` misses) can be swapped in later without coupling to `flyr` internals.
"""
from __future__ import annotations

import io

import numpy as np

from .port import NoRadiometricChannel, RadiometricFormat


def planck_raw_to_celsius(
    raw: np.ndarray, r1: float, b: float, f: float, o: float, r2: float
) -> np.ndarray:
    """Pure FLIR Planck conversion: raw 16-bit sensor counts → °C.

        T_K = PlanckB / ln(PlanckR1 / (PlanckR2·(raw + PlanckO)) + PlanckF)
        T_C = T_K − 273.15

    v1 uses default emissivity (=1) with no atmospheric correction — emissivity/atmospheric refinement
    is a later ticket; note it, don't build it here."""
    raw = np.asarray(raw, dtype=np.float64)
    t_k = b / np.log(r1 / (r2 * (raw + o)) + f)
    return (t_k - 273.15).astype(np.float32)


class FlirRjpegDecoder:
    format = RadiometricFormat.FLIR_RJPEG

    def matches(self, image_bytes: bytes, exif: dict) -> bool:
        if image_bytes[:2] != b"\xff\xd8":  # FLIR radiometric is an R-JPEG container
            return False
        if "FLIR" in str(exif.get("Make") or "").upper():
            return True
        return b"FLIR\x00" in image_bytes[:65536]  # APP1 FLIR segment marker

    def _extract(self, image_bytes: bytes) -> np.ndarray:
        """Backend boundary — returns a 2-D °C array. Swap-friendly (flyr today)."""
        import flyr

        thermogram = flyr.unpack(io.BytesIO(image_bytes))
        return np.asarray(thermogram.celsius, dtype=np.float32)

    def decode(self, image_bytes: bytes, exif: dict) -> np.ndarray:
        try:
            arr = self._extract(image_bytes)
        except NoRadiometricChannel:
            raise
        except Exception as e:  # flyr couldn't find a raw thermal payload (colorized-only / corrupt)
            raise NoRadiometricChannel("FLIR R-JPEG has no readable raw thermal payload") from e
        if arr is None or arr.ndim != 2 or arr.size == 0:
            raise NoRadiometricChannel("FLIR extraction yielded no thermal array")
        return arr
