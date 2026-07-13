#!/usr/bin/env python3
"""
Scan a built container image for forbidden artifacts in ANY layer (M2-6b, CR-35). Input is a
`docker save <image> -o img.tar` tarball. This makes the M2-6a layer guardrails REAL — executed
against actual built layers rather than statically inferred from the Dockerfile.

Fails (exit 1) if any layer contains:
  • a Confidential DJI Thermal SDK artifact (DJI EULA §14, CR-22) — the wrapper, the vendored SDK
    tree, or the DIRP native lib; or
  • a secret: a committed env file (.env*), or a file whose contents assign a known secret env var
    to a non-empty literal.

Usage:  python scripts/ci/scan_image_layers.py <image-tar> [<image-tar> ...]

Pure/stdlib so it is unit-testable (tests/guardrails/test_layer_scan.py) without Docker.
"""
from __future__ import annotations

import io
import re
import sys
import tarfile
from pathlib import PurePosixPath

# Confidential DJI artifacts (mirrors tests/guardrails/test_radiometric_dji.py::CONFIDENTIAL).
DJI = re.compile(r"(_dji_sdk_native|dji[-_]?thermal[-_]?sdk|libdirp|/dirp[./]|(^|/)dirp($|[./]))", re.I)

# A committed env file anywhere in a layer.
ENVFILE = re.compile(r"(^|/)\.env(\.[^/]+)?$")

# Secret env vars assigned a non-empty literal inside a layer file (baked secret).
SECRET_ASSIGN = re.compile(
    rb"""(SES_SMTP_PASSWORD|AUTH_SECRET|S3_SECRET_ACCESS_KEY|JIRA_API_TOKEN|INFERENCE_CALLBACK_TOKEN|INGEST_API_TOKEN)['"]?\s*[:=]\s*['"]?[^\s'"]+""",
)

# Only content-scan plausibly-textual, smallish files (avoid binaries / huge blobs).
_TEXT_SUFFIXES = (".env", ".txt", ".json", ".sh", ".yaml", ".yml", ".conf", ".ini", ".js", ".ts", ".py", "")
_MAX_CONTENT_BYTES = 512 * 1024


def _iter_layer_tars(outer: tarfile.TarFile):
    """Yield (member_name, TarFile) for every nested tar (layer) inside a docker-save tarball.

    Handles both docker-save layouts: legacy `<hash>/layer.tar` and OCI `blobs/sha256/<hash>` (whose
    blobs are themselves gzip/plain tars). Non-tar members (manifest.json, configs) are skipped.
    """
    for m in outer.getmembers():
        if not m.isfile():
            continue
        f = outer.extractfile(m)
        if f is None:
            continue
        data = f.read()
        try:
            inner = tarfile.open(fileobj=io.BytesIO(data))  # auto-detects gzip
        except tarfile.TarError:
            continue  # manifest.json, image config, etc.
        yield m.name, inner


def scan_tar(path: str) -> list[str]:
    """Return a list of human-readable violation strings (empty = clean)."""
    violations: list[str] = []
    with tarfile.open(path) as outer:
        for layer_name, inner in _iter_layer_tars(outer):
            for entry in inner.getmembers():
                if not (entry.isfile() or entry.isdir()):
                    continue
                name = entry.name
                base = PurePosixPath(name).name
                if DJI.search(name):
                    violations.append(f"DJI SDK artifact in layer {layer_name}: {name} (DJI EULA §14, CR-22)")
                    continue
                if ENVFILE.search("/" + name):
                    violations.append(f"env file baked in layer {layer_name}: {name} (secret risk, CR-35)")
                    continue
                if entry.isfile() and entry.size <= _MAX_CONTENT_BYTES and base.endswith(_TEXT_SUFFIXES):
                    ef = inner.extractfile(entry)
                    if ef is not None and SECRET_ASSIGN.search(ef.read()):
                        violations.append(f"secret literal baked in layer {layer_name}: {name} (CR-35)")
            inner.close()
    return violations


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: scan_image_layers.py <image-tar> [<image-tar> ...]", file=sys.stderr)
        return 2
    all_violations: list[str] = []
    for path in argv[1:]:
        v = scan_tar(path)
        if v:
            all_violations.extend(v)
        else:
            print(f"OK  {path}: no DJI SDK artifact, no secret in any layer")
    if all_violations:
        print("\nLAYER SCAN FAILED — forbidden artifacts baked into an image:", file=sys.stderr)
        for v in all_violations:
            print("  ✗ " + v, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
