"""
Guardrails for OPS-2 — the Integrations config surface (CR-05, CR-03, CR-20, MANIFEST §3).

Enforces:
  • integration mutations are ADMIN-only (REVIEWER read-only), through the authenticated DAL,
    org-scoped, inside runWithOrg (RLS, M1-02);
  • NON-NEGOTIABLE secret discipline: no raw credential is accepted, persisted, or rendered — config
    is a non-secret whitelist, secret config keys/values are rejected, secretVaultKey is a REFERENCE,
    and the UI never collects a masked secret (no type=password) and states the out-of-band posture;
  • referential safety: a delete/deactivate that would orphan a RuleSet route is refused.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADMIN = ROOT / "apps/web/lib/integrations/admin.ts"
ACTIONS = ROOT / "apps/web/app/(cockpit)/integrations/actions.ts"
PAGE = ROOT / "apps/web/app/(cockpit)/integrations/page.tsx"
UI = ROOT / "apps/web/app/(cockpit)/integrations/IntegrationsConfig.tsx"

SECRET = re.compile(r"(token|secret|password|passwd|pwd|api[_-]?key|apikey|credential|authorization|bearer|private[_-]?key|access[_-]?key)", re.I)


def test_files_present():
    for f in (ADMIN, ACTIONS, PAGE, UI):
        assert f.exists(), f"missing {f.name}"


def test_mutations_are_admin_gated():
    src = ACTIONS.read_text()
    assert 'role !== "ADMIN"' in src, "integration mutations must be ADMIN-only (REVIEWER read-only)"
    assert src.count("requireAdminOrg") >= 3, "create/update/delete must each pass the ADMIN gate"
    for act in ("createIntegrationAction", "updateIntegrationAction", "deleteIntegrationAction"):
        assert act in src, f"missing action {act}"


def test_mutations_through_the_authenticated_dal_and_org_scoped():
    a = ACTIONS.read_text()
    assert a.lstrip().startswith('"use server"'), "integration actions must be server actions"
    assert "requireSession" in a and "runWithOrg" in a, "mutations validate the session + run inside runWithOrg (CR-20, M1-02)"
    adm = ADMIN.read_text()
    assert adm.count("organizationId") >= 6, "integration admin queries must be organizationId-scoped"
    for fn in ("listIntegrations", "createIntegration", "updateIntegration", "deleteIntegration"):
        assert f"export async function {fn}(organizationId: string" in adm, f"{fn} must take organizationId"


def test_no_raw_secret_is_accepted_or_persisted():
    adm = ADMIN.read_text()
    # the validator actively rejects secret keys AND secret-looking values
    assert "SECRET_KEY" in adm and "SECRET_VALUE" in adm, "config must reject secret keys + secret-looking values (CR-03)"
    assert "validateIntegrationInput" in adm
    # no credential-named field is ever WRITTEN to the DB (the create/update data blocks)
    for bad in ("token:", "apiKey:", "api_key:", "password:", "secret:", "credential:"):
        assert bad not in adm, f"integration admin must not persist a raw secret field ({bad})"
    # every whitelisted config key is non-secret
    for key in re.findall(r'key:\s*"([^"]+)"', adm):
        assert not SECRET.search(key), f"whitelisted config key '{key}' names a secret — forbidden (CR-03)"


def test_ui_never_collects_or_renders_a_raw_secret():
    ui = UI.read_text()
    # a raw credential would be collected with a masked field — there must be none
    assert "type=\"password\"" not in ui and "type='password'" not in ui, "the UI must never collect a masked secret (CR-03)"
    # the only secret-related input is the vault REFERENCE, and the surface states the posture plainly
    assert "secretVaultKey" in ui, "secret is referenced by vault key, never entered raw"
    assert "reference" in ui.lower(), "the secret field must be labelled a reference"
    assert ("secrets manager" in ui.lower()) or ("vault" in ui.lower()), "UI must state the secret is provisioned out-of-band"
    assert "never paste" in ui.lower(), "UI must explicitly tell the user not to paste a credential"


def test_referential_safety_on_delete_and_deactivate():
    adm = ADMIN.read_text()
    assert "routeOrphanReason" in adm, "must guard against orphaning a RuleSet route"
    assert "routeTargets" in adm, "the orphan check consults RuleSet.routeTargets"
    assert "workOrderDispatch.count" in adm, "delete must preserve the dispatch audit trail (CR-12)"
