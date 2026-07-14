"""
Guardrail — Prisma is pinned to major 6 (M2-7 / CR-36).

Prisma 7 REMOVED the datasource `directUrl` property, which the RLS dual-role topology depends on
(CR-20): the runtime connects as the non-superuser `datumzero_app` (RLS enforced) while migrations run
as the elevated role via `directUrl`. A `pnpm update --latest` to Prisma 7 would silently stop RLS from
applying and drop tenant isolation with NO test failing. This turns that dependency drift into a red
build. Upgrading to Prisma 7 requires RE-ARCHITECTING the dual-role connection first (a known constraint).

Run: pytest tests/guardrails -q
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PKG = ROOT / "packages/db/package.json"
ROOT_PKG = ROOT / "package.json"
LOCK = ROOT / "pnpm-lock.yaml"
CI = ROOT / ".github/workflows/ci.yml"

# Accept ^6.x / ~6.x / 6.x / "6"; reject 7, latest, *, >=6, etc.
MAJOR_6 = re.compile(r"^[\^~]?6(\.|$)")


def test_db_package_declares_prisma_major_6():
    d = json.loads(DB_PKG.read_text())
    for field, name in (("dependencies", "@prisma/client"), ("devDependencies", "prisma")):
        v = d.get(field, {}).get(name)
        assert v, f"{name} must be declared in {field}"
        assert MAJOR_6.match(v), f"{name} must be pinned to major 6 (got {v!r}) — Prisma 7 removes directUrl (CR-20/CR-36)"


def test_root_override_pins_prisma_major_6_tree_wide():
    ov = json.loads(ROOT_PKG.read_text()).get("pnpm", {}).get("overrides", {})
    for name in ("prisma", "@prisma/client"):
        v = ov.get(name)
        assert v is not None, f"pnpm.overrides must pin {name} to major 6 (structural, tree-wide)"
        assert MAJOR_6.match(str(v)), f"pnpm.overrides {name} must be major 6 (got {v!r})"


def test_lockfile_resolves_prisma_6_not_7():
    lock = LOCK.read_text()
    assert re.search(r"\bprisma@6\.", lock), "the lockfile must resolve prisma to 6.x"
    assert not re.search(r"\bprisma@7\.", lock), "prisma 7 must not appear in the lockfile"
    assert not re.search(r"@prisma/client@7\.", lock), "@prisma/client 7 must not appear in the lockfile"


def test_ci_schema_validator_pinned_to_6():
    ci = CI.read_text()
    assert "prisma@6 validate" in ci, "CI schema validation must use prisma@6"
    assert "prisma@latest validate" not in ci, "CI must not validate with prisma@latest (drifts to 7)"
