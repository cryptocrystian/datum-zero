"""
Guardrails for M2-5a — production email transport + auth hardening (CR-34).

The dev magic-link exposure (console + a temp file that /signin renders as a one-click link) is account
takeover if it ever runs in production. These tests make that impossible to regress silently:
  • the dev path is REFUSED in production (getEmailPort + the dev adapter both fail closed);
  • the magic-link file is referenced only in the single dev-gated module, and the URL is never logged
    on the production send path;
  • no email-provider secret is hardcoded — credentials resolve from env/vault only, never the DB.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
EMAIL = WEB / "lib/email"
INDEX = EMAIL / "index.ts"
DEV = EMAIL / "dev.ts"
SES = EMAIL / "ses.ts"
SECRETS = EMAIL / "secrets.ts"
AUTH = WEB / "auth.ts"
SIGNIN = WEB / "app/signin/page.tsx"
SCHEMA = ROOT / "packages/db/prisma/schema.prisma"

DEV_LINK = "dz-magic-link"


def _sources(include_tests: bool = True):
    for f in list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx")):
        if "node_modules" in f.parts or ".next" in f.parts:
            continue
        if not include_tests and (f.name.endswith(".test.ts") or f.name.endswith(".e2e.ts")):
            continue
        yield f


def test_dev_path_cannot_run_in_production():
    idx = INDEX.read_text()
    assert 'NODE_ENV === "production"' in idx, "port selection must branch on NODE_ENV"
    assert "not permitted in production" in idx, "getEmailPort must REFUSE the dev provider in prod (fail closed)"
    dev = DEV.read_text()
    assert "devDeliveryAllowed" in dev, "the dev adapter must use the shared exposure predicate"
    assert 'NODE_ENV !== "production"' in dev, "the dev-exposure predicate must key on NODE_ENV"
    assert "not permitted in production" in dev, "the dev adapter must THROW in production (defense in depth)"


def test_no_magic_link_written_or_logged_outside_the_dev_gate():
    # The temp-file appears ONLY in the dev adapter (write) and /signin (read) — both dev-gated.
    referencing = [f for f in _sources() if DEV_LINK in f.read_text(errors="ignore")]
    allowed = {DEV.resolve(), SIGNIN.resolve()}
    offenders = [str(f.relative_to(ROOT)) for f in referencing if f.resolve() not in allowed]
    assert not offenders, "the dev magic-link file must not be referenced outside dev.ts / signin:\n" + "\n".join(offenders)
    assert "devDeliveryAllowed" in SIGNIN.read_text(), "/signin must gate the dev link on devDeliveryAllowed()"
    # The magic-link URL must never be console-logged on the production send path.
    log_url = re.compile(r"console\.(log|info|warn|error)\([^)]*\burl\b")
    for f in (AUTH, SES):
        assert not log_url.search(f.read_text()), f"{f.relative_to(ROOT)} must never log the magic-link url"


def test_no_email_provider_secret_hardcoded_or_in_db():
    # Credentials are read from env (the vault) — the SMTP password only appears as an env read.
    assert "env.SES_SMTP_PASSWORD" in SECRETS.read_text(), "SMTP password must be read from env (vault)"
    # No production source assigns a provider secret to a string literal (test fixtures excluded).
    assign = re.compile(r"SES_SMTP_(PASSWORD|USER)\s*[:=]\s*[\"'`]")
    offenders = [str(f.relative_to(ROOT)) for f in _sources(include_tests=False) if assign.search(f.read_text(errors="ignore"))]
    assert not offenders, "an email-provider secret is assigned a literal (must come from the vault):\n" + "\n".join(offenders)
    # The email secret is never a DB column.
    schema = SCHEMA.read_text()
    assert "SES_SMTP" not in schema and "smtpPass" not in schema, "email secret must never be persisted in the DB"
