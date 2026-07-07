"""
DET-1a — data prep for the thermal anomaly classifier.

Fetches the InfraredSolarModules dataset (Raptor Maps, MIT) from the GitHub repo zip and extracts it
into training/data/ (GITIGNORED — the 20k-image raw dataset is never committed). Also writes a small
committed sample subset (a few images per class) into training/samples/ for deterministic tests.

Fallback if GitHub is unavailable: the Kaggle mirror `marcosgabriel/infrared-solar-modules`
(`kaggle datasets download -d marcosgabriel/infrared-solar-modules`) — same images/metadata.

Run:  python training/prep_data.py         (downloads + extracts + writes samples)
"""
from __future__ import annotations

import json
import shutil
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

REPO_ZIP_URL = "https://github.com/RaptorMaps/InfraredSolarModules/raw/master/2020-02-14_InfraredSolarModules.zip"
LICENSE_URL = "https://raw.githubusercontent.com/RaptorMaps/InfraredSolarModules/master/LICENSE"

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "data"
ZIP_PATH = DATA_DIR / "InfraredSolarModules.zip"
EXTRACT_ROOT = DATA_DIR / "InfraredSolarModules"
SAMPLES_DIR = HERE / "samples"
SAMPLES_PER_CLASS = 3  # committed for tests — a few images per class, deterministic (lowest ids)


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"[prep] already present: {dest.name} ({dest.stat().st_size:,} bytes)")
        return
    print(f"[prep] downloading {url} -> {dest}")
    with urllib.request.urlopen(url, timeout=180) as r, open(dest, "wb") as f:  # noqa: S310 (trusted host)
        shutil.copyfileobj(r, f)
    print(f"[prep] saved {dest.name} ({dest.stat().st_size:,} bytes)")


def extract() -> None:
    if (EXTRACT_ROOT / "module_metadata.json").exists():
        print("[prep] already extracted.")
        return
    print(f"[prep] extracting {ZIP_PATH.name} …")
    with zipfile.ZipFile(ZIP_PATH) as z:
        for name in z.namelist():
            if name.startswith("__MACOSX/") or name.endswith(".DS_Store"):
                continue
            z.extract(name, DATA_DIR)
    print("[prep] extracted.")


def load_metadata() -> dict[str, dict]:
    with open(EXTRACT_ROOT / "module_metadata.json") as f:
        return json.load(f)


def write_samples(meta: dict[str, dict]) -> None:
    """Copy a few images per class into training/samples/<Class>/ (committed, deterministic)."""
    if SAMPLES_DIR.exists():
        shutil.rmtree(SAMPLES_DIR)
    by_class: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for key, entry in meta.items():
        try:
            ident = int(key)
        except ValueError:
            ident = int(Path(entry["image_filepath"]).stem)
        by_class[entry["anomaly_class"]].append((ident, entry["image_filepath"]))
    total = 0
    for cls, items in sorted(by_class.items()):
        out = SAMPLES_DIR / cls
        out.mkdir(parents=True, exist_ok=True)
        for ident, rel in sorted(items)[:SAMPLES_PER_CLASS]:
            src = EXTRACT_ROOT / rel
            shutil.copyfile(src, out / f"{ident}.jpg")
            total += 1
    print(f"[prep] wrote {total} sample images across {len(by_class)} classes -> {SAMPLES_DIR}")


def main() -> int:
    download(REPO_ZIP_URL, ZIP_PATH)
    # keep a copy of the upstream license alongside the raw data (not committed)
    try:
        download(LICENSE_URL, DATA_DIR / "UPSTREAM_LICENSE")
    except Exception as e:  # noqa: BLE001
        print(f"[prep] (non-fatal) could not fetch upstream LICENSE: {e}")
    extract()
    meta = load_metadata()
    counts: dict[str, int] = defaultdict(int)
    for entry in meta.values():
        counts[entry["anomaly_class"]] += 1
    print(f"[prep] dataset: {len(meta):,} images across {len(counts)} classes")
    for cls, n in sorted(counts.items()):
        print(f"         {cls:<16} {n:>6,}")
    write_samples(meta)
    print("[prep] done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
