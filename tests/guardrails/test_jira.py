"""
Guardrails for M0-10 — the NATIVE_JIRA adapter (CR-05, CR-12).

  • Jira registers behind the SAME adapter interface as the generic webhook;
  • the (team-managed) issue type is resolved from create-metadata, not a hardcoded global name;
  • credentials come from the vault (secretVaultKey / env), NEVER the database, and the standalone
    worker loads .env.local so the outbound call sees them;
  • the Jira summary/description are evidence-framed (verdict-language is separately scanned by
    test_manifest_compliance over packages/adapters/**).

Run: pytest tests/guardrails -q
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADAPTERS = ROOT / "packages/adapters/src"
JIRA = ADAPTERS / "jira.ts"
SECRETS = ADAPTERS / "secrets.ts"
WORKER_MAIN = ROOT / "apps/web/lib/outbox/worker-main.ts"


def test_jira_adapter_present_and_registered():
    assert JIRA.exists(), "native Jira adapter missing (M0-10)"
    src = JIRA.read_text()
    assert 'targetType: "NATIVE_JIRA"' in src, "Jira adapter must declare its target type"
    assert "mapToJiraIssue" in src, "Jira adapter must map the canonical payload to an issue"
    assert '"DZ"' in src, "Jira issues target project DZ"


def test_jira_resolves_issue_type_via_createmeta():
    """Team-managed project → resolve the issue type from create-metadata, not a global name."""
    src = JIRA.read_text()
    assert "createmeta" in src, "issue type must be resolved via the create-metadata endpoint"
    assert "resolveIssueTypeId" in src, "issue type resolution must be explicit"
    assert "issuetype: { id:" in src, "issue must reference the resolved issue type id (not a name)"
    assert 'issuetype: { name:' not in src, "team-managed project must not use a global issue type name"


def test_jira_credentials_from_vault_never_db():
    jira = JIRA.read_text()
    secrets = SECRETS.read_text()
    assert "resolveJiraCredentials" in jira, "Jira adapter must resolve creds via the vault seam"
    assert "secretVaultKey" in secrets, "secret resolution must key off secretVaultKey"
    for env_var in ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"):
        assert env_var in secrets, f"dev vault must read {env_var} from env"
    for f, src in ((JIRA, jira), (SECRETS, secrets)):
        assert "@dz/db" not in src and "prisma" not in src.lower(), f"{f.name} must never read credentials from the DB"


def test_worker_loads_env_local_for_creds():
    src = WORKER_MAIN.read_text()
    assert "loadEnvFile" in src and ".env.local" in src, (
        "the standalone worker must load .env.local so the Jira call sees the creds"
    )


def test_jira_summary_is_evidence_framed():
    src = JIRA.read_text()
    assert "buildJiraSummary" in src and "buildJiraDescriptionLines" in src
    assert "review recommended" in src, "Jira summary must use evidence-framed review language (CR-12)"
