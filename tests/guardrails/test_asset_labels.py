"""
Guardrail for CR-17 — canonical asset-label standard.

The Brand Guide §5 / CR-17 serialization `SITE_ID-ARRAY_ID-ROW_ID-STRING_ID[-NODE_ID]` is the
canonical `Asset.internalLabel` spine across UI, work-order payload, and registry (CR-13). This
pins the seed to that format so a regression to the legacy `PV_ARRAY_*` scheme fails the build.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "packages/db/prisma/seed.ts"


def test_seed_emits_cr17_canonical_label():
    src = SEED.read_text()
    # SITE_ID-ARRAY_ID-ROW_<rr>-STR_<ss>, 2-digit zero-pad (CR-17).
    assert re.search(
        r"APEX_SOLAR-GRID_04-ROW_\$\{String\(r\)\.padStart\(2,\s*\"0\"\)\}-STR_\$\{String\(s\)\.padStart\(2,\s*\"0\"\)\}",
        src,
    ), "seed must emit the CR-17 canonical asset label (SITE_ID-ARRAY_ID-ROW-STRING)"


def test_seed_dropped_legacy_label_scheme():
    src = SEED.read_text()
    assert "PV_ARRAY_" not in src, "legacy PV_ARRAY_* label scheme must not survive (CR-17)"


def test_seed_asset_upsert_converges():
    """Re-seeding must migrate existing rows, not no-op (update: sets the canonical fields)."""
    src = SEED.read_text()
    assert re.search(
        r"update:\s*\{\s*internalLabel", src
    ), "asset.upsert must converge internalLabel in the update: clause (CR-17 migration)"
