"""
Guardrails for OPS-3 — the Asset Registry surface + bulk CSV import (CR-13, CR-17, CR-20).

Enforces:
  • registry mutations are ADMIN-only (REVIEWER read-only), through the authenticated DAL, org-scoped
    inside runWithOrg (RLS, M1-02);
  • internalLabel is validated against the CR-17 canonical format and coordinates against valid 6-dp
    ranges;
  • referential safety: deleting an asset an Anomaly references is refused (audit trail, CR-12);
  • bulk import validates every row, is transactional, and reports per-row errors;
  • registry UI copy stays evidence-framed.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADMIN = ROOT / "apps/web/lib/registry/asset-admin.ts"
ACTIONS = ROOT / "apps/web/app/(cockpit)/registry/actions.ts"
PAGE = ROOT / "apps/web/app/(cockpit)/registry/page.tsx"
UI = ROOT / "apps/web/app/(cockpit)/registry/AssetRegistry.tsx"

VERDICT = re.compile(r"\b(violation|breach|back[- ]?charge|penalty|liable|guilty|enforce)\b", re.I)


def test_files_present():
    for f in (ADMIN, ACTIONS, PAGE, UI):
        assert f.exists(), f"missing {f.name}"


def test_mutations_are_admin_gated():
    src = ACTIONS.read_text()
    assert 'role !== "ADMIN"' in src, "registry mutations must be ADMIN-only (REVIEWER read-only)"
    assert src.count("requireAdminOrg") >= 4, "create/update/delete/import must each pass the ADMIN gate"
    for act in ("createAssetAction", "updateAssetAction", "deleteAssetAction", "importAssetsAction"):
        assert act in src, f"missing action {act}"


def test_mutations_through_the_authenticated_dal_and_org_scoped():
    a = ACTIONS.read_text()
    assert a.lstrip().startswith('"use server"'), "registry actions must be server actions"
    assert "requireSession" in a and "runWithOrg" in a, "mutations validate the session + run inside runWithOrg (CR-20, M1-02)"
    adm = ADMIN.read_text()
    assert adm.count("organizationId") >= 8, "asset admin queries must be organizationId-scoped"
    for fn in ("createAsset", "updateAsset", "deleteAsset", "importAssetsCsv"):
        assert f"export async function {fn}(organizationId: string" in adm, f"{fn} must take organizationId"


def test_cr17_label_and_coord_validation():
    adm = ADMIN.read_text()
    assert "isCanonicalLabel" in adm and "validateAssetInput" in adm, "must validate the CR-17 label"
    # 4 or 5 uppercase segments — the canonical serialization
    assert "parts.length >= 4 && parts.length <= 5" in adm, "CR-17 label must be 4-5 segments"
    assert "A-Z" in adm, "label segments are uppercase (CR-17)"
    # coordinate ranges + 6-dp
    assert "validateCoordString" in adm and "90" in adm and "180" in adm, "coords validated to ±90/±180"
    assert re.search(r"\\d\{1,6\}", adm), "coordinates capped at 6 decimal places (CR-17)"


def test_referential_safety_on_delete():
    adm = ADMIN.read_text()
    assert "anomaly.count" in adm, "delete must refuse when an Anomaly references the asset (audit trail, CR-12)"


def test_bulk_import_is_transactional_and_reports_per_row_errors():
    adm = ADMIN.read_text()
    assert "parseAssetCsv" in adm, "bulk import must parse CSV"
    assert "$transaction" in adm, "bulk import must be transactional"
    assert "validateAssetInput" in adm, "every CSV row must be validated"
    assert re.search(r"errors\.push\(\{\s*row", adm), "import must report per-row errors with line numbers"
    assert "if (errors.length > 0) return { imported: 0" in adm, "on any error, import nothing (all-or-nothing)"


def test_registry_ui_copy_is_evidence_framed():
    offenders = []
    for f in (PAGE, UI):
        for i, line in enumerate(f.read_text(errors="ignore").splitlines(), 1):
            if VERDICT.search(line):
                offenders.append(f"{f.name}:{i}: {line.strip()}")
    assert not offenders, "verdict language in registry UI copy (CR-12):\n" + "\n".join(offenders)
