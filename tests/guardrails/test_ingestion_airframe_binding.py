"""
Guardrails for M0-04 ingestion — fail-closed airframe binding + the StoragePort seam.

Converts CR-11 (verified airframe registry, fail closed) and MANIFEST §3 (all object storage
behind one seam) into things that FAIL a build. Static/source-level checks only — no runtime.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

ROUTE = ROOT / "apps/web/app/api/v1/ingestion/upload/route.ts"
BINDING = ROOT / "apps/web/lib/ingestion/airframe-binding.ts"
SCHEMA = ROOT / "packages/db/prisma/schema.prisma"
STORAGE_PKG = ROOT / "packages/storage"


def test_ingestion_files_present():
    assert ROUTE.exists(), "ingestion upload route missing (M0-04)"
    assert BINDING.exists(), "airframe-binding module missing (CR-11)"
    assert (STORAGE_PKG / "src/index.ts").exists(), "StoragePort package missing"


def test_ingestion_session_ndaa_defaults_false():
    """CR-11: isNdaaVerified defaults FALSE until bound to a verified airframe."""
    schema = SCHEMA.read_text()
    assert re.search(
        r"isNdaaVerified\s+Boolean\s+@default\(false\)", schema
    ), "IngestionSession.isNdaaVerified must default to false (CR-11)"


def test_binding_fails_closed():
    """CR-11: an unknown or unverified serial must return ok:false (fail closed)."""
    src = BINDING.read_text()
    assert "ndaaVerified" in src, "binding must check the airframe's ndaaVerified flag (CR-11)"
    assert "ok: false" in src, "binding must have a fail-closed (ok:false) path (CR-11)"
    for reason in ("NO_MATCH", "NOT_VERIFIED"):
        assert reason in src, f"binding must distinguish the '{reason}' fail-closed reason (CR-11)"
    # Tenant-scoped registry lookup (multi-tenant native).
    assert "organizationId" in src, "airframe lookup must be tenant-scoped (organizationId)"


def test_route_binds_before_persisting():
    """CR-11: the session is only created AFTER a passing airframe binding (fail closed)."""
    src = ROUTE.read_text()
    assert "bindAirframe" in src, "route must bind the airframe (CR-11)"

    guard = src.find("!binding.ok")
    create = src.find("ingestionSession.create")
    assert guard != -1, "route must guard on the binding result (!binding.ok)"
    assert create != -1, "route must create the IngestionSession"
    assert guard < create, "the fail-closed guard must precede session creation (CR-11)"

    # isNdaaVerified must mirror the binding result, never be hardcoded true.
    assert "isNdaaVerified: binding.isNdaaVerified" in src, (
        "session.isNdaaVerified must be derived from the verified binding (CR-11)"
    )
    assert "isNdaaVerified: true" not in src, (
        "isNdaaVerified must never be hardcoded true in the ingestion route (CR-11)"
    )


def test_object_storage_goes_through_the_port():
    """MANIFEST §3: only the storage package may import an S3 SDK; everyone else uses the seam."""
    # The ingestion route writes through the port, not a raw SDK.
    route_src = ROUTE.read_text()
    assert "@dz/storage" in route_src, "route must write through the StoragePort (@dz/storage)"
    assert "@aws-sdk" not in route_src, "route must not import an S3 SDK directly (use the port)"

    # No file OUTSIDE packages/storage may reach for the AWS SDK.
    scanned = list((ROOT / "apps/web").rglob("*.ts")) + list((ROOT / "apps/web").rglob("*.tsx"))
    for pkg in ("db", "adapters"):
        scanned += list((ROOT / "packages" / pkg).rglob("*.ts"))
    offenders = []
    for f in scanned:
        if "node_modules" in f.parts or ".next" in f.parts:
            continue
        if "@aws-sdk" in f.read_text(errors="ignore"):
            offenders.append(str(f.relative_to(ROOT)))
    assert not offenders, (
        "Object storage must go through the StoragePort seam; direct @aws-sdk import(s):\n"
        + "\n".join(offenders)
    )
