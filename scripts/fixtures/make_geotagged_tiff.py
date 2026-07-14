#!/usr/bin/env python3
"""
M2-7c — generate a deterministic, license-free radiometric TIFF fixture carrying valid GPS + timestamp
EXIF, so the real-trigger DoD e2e exercises the M2-3a Part D completeness gate AND the coordinate→
binding flow (which the simulated-callback DoD never touched).

Pixel encoding mirrors services/inference/tests/test_delta_t.py: little-endian 16-bit DN =
round((°C + 273.15)·100) — decoded by RadiometricTiffDecoder as T_C = DN·0.01 − 273.15. Base 25 °C with
a hot block at 60 °C → ΔT ≈ 35 °C.

GPS is set to the SEEDED asset APEX_SOLAR-GRID_04-ROW_01-STR_01 = (32.222690, -110.974590), which is NOT
the inference SAMPLE fallback (ROW_02-STR_03) — so a correct bind PROVES the fixture's GPS drove it.

The TIFF is hand-assembled (pure struct) because Pillow cannot write EXIF/GPS sub-IFDs into a TIFF and
no exiftool/tifffile is available. The output is a committed binary fixture; this script documents its
provenance + reproduces it byte-for-byte.

Run: python scripts/fixtures/make_geotagged_tiff.py
"""
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/e2e/fixtures/geotagged_radiometric.tiff"
# Negative case: same radiometric payload, NO EXIF — must fail the M2-3a Part D completeness gate.
OUT_NO_EXIF = ROOT / "apps/web/e2e/fixtures/no_exif_radiometric.tiff"

W, H = 300, 240
LAT, LON = 32.222690, -110.974590
DTO = b"2026:07:05 18:00:00\x00"  # 20 bytes incl NUL

# TIFF field types
BYTE, ASCII, SHORT, LONG, RATIONAL = 1, 2, 3, 4, 5
_TYPE_SIZE = {BYTE: 1, ASCII: 1, SHORT: 2, LONG: 4, RATIONAL: 8}


def dn(celsius: float) -> int:
    return int(round((celsius + 273.15) * 100.0))


def dms(value: float):
    v = abs(value)
    d = int(v)
    m = int((v - d) * 60)
    s = (v - d - m / 60.0) * 3600.0
    return [(d, 1), (m, 1), (int(round(s * 10000)), 10000)]


def _pack_value(ftype, values):
    """Serialize a tag's values to bytes (the raw field payload, before inline/offset decision)."""
    if ftype == ASCII:
        return values if isinstance(values, (bytes, bytearray)) else values.encode()
    if ftype == SHORT:
        return b"".join(struct.pack("<H", v) for v in values)
    if ftype == LONG:
        return b"".join(struct.pack("<I", v) for v in values)
    if ftype == RATIONAL:
        return b"".join(struct.pack("<II", n, d) for (n, d) in values)
    if ftype == BYTE:
        return bytes(values)
    raise ValueError(ftype)


def build_ifd(entries, next_ifd_offset, heap_offset):
    """entries: list of (tag, type, count, values). Returns (ifd_bytes, heap_bytes, new_heap_offset).
    Values > 4 bytes go on the heap (aligned even); the 12-byte entry stores the heap offset."""
    entries = sorted(entries, key=lambda e: e[0])  # TIFF requires ascending tag order
    ifd = struct.pack("<H", len(entries))
    heap = b""
    cur = heap_offset
    for tag, ftype, count, values in entries:
        payload = _pack_value(ftype, values)
        size = _TYPE_SIZE[ftype] * count
        entry = struct.pack("<HHI", tag, ftype, count)
        if size <= 4:
            entry += payload + b"\x00" * (4 - len(payload))
        else:
            if cur % 2:
                heap += b"\x00"
                cur += 1
            entry += struct.pack("<I", cur)
            heap += payload
            cur += len(payload)
        ifd += entry
    ifd += struct.pack("<I", next_ifd_offset)
    return ifd, heap, cur


def main() -> int:
    arr = np.full((H, W), dn(25.0), dtype="<u2")
    arr[100:130, 150:180] = dn(60.0)
    image = arr.tobytes()

    header_len = 8
    data_off = header_len
    ifd0_off = data_off + len(image)

    # IFD0 needs the EXIF/GPS sub-IFD offsets, which depend on IFD0's own size + heap. Compute sizes.
    lat, lon = dms(LAT), dms(LON)
    exif_entries = [(36867, ASCII, len(DTO), DTO), (36868, ASCII, len(DTO), DTO)]
    gps_entries = [
        (1, ASCII, 2, b"N\x00"),
        (2, RATIONAL, 3, lat),
        (3, ASCII, 2, b"W\x00"),
        (4, RATIONAL, 3, lon),
    ]
    ifd0_n = 13
    ifd0_size = 2 + ifd0_n * 12 + 4
    ifd0_heap_off = ifd0_off + ifd0_size
    # place IFD0 heap (Make/Model strings), then EXIF IFD, then GPS IFD.
    make = b"Datum Zero\x00"
    model = b"DZ-THERMAL-TIFF\x00"
    heap = b""
    cur = ifd0_heap_off
    if cur % 2:
        heap += b"\x00"; cur += 1
    make_off = cur; heap += make; cur += len(make)
    if cur % 2:
        heap += b"\x00"; cur += 1
    model_off = cur; heap += model; cur += len(model)
    if cur % 2:
        heap += b"\x00"; cur += 1
    exif_ifd_off = cur
    exif_ifd, exif_heap, cur = build_ifd(exif_entries, 0, exif_ifd_off + (2 + len(exif_entries) * 12 + 4))
    heap += exif_ifd + exif_heap
    if cur % 2:
        heap += b"\x00"; cur += 1
    gps_ifd_off = cur
    gps_ifd, gps_heap, cur = build_ifd(gps_entries, 0, gps_ifd_off + (2 + len(gps_entries) * 12 + 4))
    heap += gps_ifd + gps_heap

    ifd0_entries = [
        (256, SHORT, 1, [W]), (257, SHORT, 1, [H]), (258, SHORT, 1, [16]), (259, SHORT, 1, [1]),
        (262, SHORT, 1, [1]), (271, ASCII, len(make), None), (272, ASCII, len(model), None),
        (273, LONG, 1, [data_off]), (277, SHORT, 1, [1]), (278, SHORT, 1, [H]),
        (279, LONG, 1, [len(image)]), (34665, LONG, 1, [exif_ifd_off]), (34853, LONG, 1, [gps_ifd_off]),
    ]
    # Build IFD0 by hand (Make/Model use pre-computed heap offsets).
    ifd0_entries = sorted(ifd0_entries, key=lambda e: e[0])
    assert len(ifd0_entries) == ifd0_n
    ifd0 = struct.pack("<H", len(ifd0_entries))
    for tag, ftype, count, values in ifd0_entries:
        entry = struct.pack("<HHI", tag, ftype, count)
        if tag == 271:
            entry += struct.pack("<I", make_off)
        elif tag == 272:
            entry += struct.pack("<I", model_off)
        else:
            payload = _pack_value(ftype, values)
            entry += payload + b"\x00" * (4 - len(payload))
        ifd0 += entry
    ifd0 += struct.pack("<I", 0)

    blob = b"II" + struct.pack("<HI", 42, ifd0_off) + image + ifd0 + heap
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(blob)
    print(f"wrote {OUT} ({len(blob)} bytes) — GPS ({LAT},{LON}) DTO {DTO.decode().strip(chr(0))}")

    # Negative fixture: a minimal baseline TIFF with NO EXIF/GPS (must fail Part D). Same 16-bit payload.
    minimal = [
        (256, SHORT, 1, [W]), (257, SHORT, 1, [H]), (258, SHORT, 1, [16]), (259, SHORT, 1, [1]),
        (262, SHORT, 1, [1]), (273, LONG, 1, [data_off]), (277, SHORT, 1, [1]),
        (278, SHORT, 1, [H]), (279, LONG, 1, [len(image)]),
    ]
    n_ifd0_off = data_off + len(image)
    n_ifd, n_heap, _ = build_ifd(minimal, 0, n_ifd0_off + (2 + len(minimal) * 12 + 4))
    n_blob = b"II" + struct.pack("<HI", 42, n_ifd0_off) + image + n_ifd + n_heap
    OUT_NO_EXIF.write_bytes(n_blob)
    print(f"wrote {OUT_NO_EXIF} ({len(n_blob)} bytes) — no EXIF (Part D negative case)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
