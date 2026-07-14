"""
Guardrails for M2-6c — the Terraform AWS baseline (CR-37).

Terraform is a rule-bearing surface: a one-line edit here can silently undo an invariant the whole
codebase is built to hold. These assert the ones that would fail SILENTLY in production:

  • NO secret VALUE is representable in Terraform — the secrets module declares containers only, and
    no .tf/.tfvars.example carries a credential (MANIFEST §3: vault only, never repo/DB/logs);
  • the RLS dual-role is NOT collapsible — the runtime role must differ from the master/migration
    role, enforced by variable validation at plan time (CR-20/CR-35);
  • the data tier is not reachable from the internet, and is encrypted at rest + in transit;
  • Redis keeps `noeviction` — any other policy lets BullMQ silently DROP queued inference jobs, so
    an upload would be accepted and never processed (fail-open — the one thing we never allow);
  • state and tfvars can never be committed.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TF_DIR = ROOT / "terraform"
SECRETS_TF = TF_DIR / "modules/secrets/main.tf"
RDS_TF = TF_DIR / "modules/rds/main.tf"
REDIS_TF = TF_DIR / "modules/redis/main.tf"
STORAGE_TF = TF_DIR / "modules/storage/main.tf"
TFVARS_EXAMPLE = TF_DIR / "envs/prod/terraform.tfvars.example"
GITIGNORE = ROOT / ".gitignore"


def tf_files():
    files = sorted(TF_DIR.rglob("*.tf"))
    assert files, "no .tf files found — the baseline should be committed under terraform/"
    return files


def strip_comments(text: str) -> str:
    """Drop # and // line comments so prose about secrets never trips a value scanner."""
    out = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("#") or s.startswith("//"):
            continue
        out.append(re.sub(r"\s+#.*$", "", line))
    return "\n".join(out)


# --- no secret VALUE is representable in Terraform ---


def test_secrets_are_declared_never_valued():
    """
    A secret_version resource would put the plaintext into Terraform state. The module creates the
    container; the user injects the value out-of-band (docs/DEPLOY.md).
    """
    for f in tf_files():
        body = strip_comments(f.read_text())
        assert "aws_secretsmanager_secret_version" not in body, (
            f"{f.relative_to(ROOT)}: a secret VERSION carries the plaintext value into Terraform "
            "state. Declare the container only; inject the value out-of-band (MANIFEST §3)."
        )


def test_secrets_module_declares_the_dual_role_urls_separately():
    names = re.search(r"secret_names\s*=\s*\[(.*?)\]", SECRETS_TF.read_text(), re.S)
    assert names, "secrets module must declare a secret_names list"
    declared = set(re.findall(r'"([A-Z0-9_]+)"', names.group(1)))
    # Two distinct connection strings — one per role. Collapsing them collapses RLS (CR-20).
    assert {"DATABASE_URL", "DIRECT_DATABASE_URL"} <= declared, (
        "the runtime URL (non-superuser, RLS-subject) and the migration URL (Prisma directUrl) must "
        "be separate secrets — CR-20/CR-35"
    )


AWS_KEY = re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b")
PEM = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")
SECRETISH_ASSIGN = re.compile(
    r"^\s*(?!#)\S*(password|secret|token|api_?key|access_key)\S*\s*=\s*\"(?!\"\s*$)([^\"]+)\"",
    re.I | re.M,
)
# ARNs, role NAMES, and *_arn/*_name/*_username references are identifiers, not credentials.
IDENTIFIER_OK = re.compile(r"(_arns?\b|_name\b|_names\b|_username\b|^arn:aws|\$\{|valueFrom)", re.I)


def secret_literals(text: str) -> list[str]:
    """Secret-looking VALUE assignments in Terraform source. Identifiers (ARNs, names) are not."""
    hits = []
    if AWS_KEY.search(text):
        hits.append("aws-access-key-literal")
    if PEM.search(text):
        hits.append("private-key-literal")
    for m in SECRETISH_ASSIGN.finditer(text):
        assigned, value = m.group(0), m.group(2)
        if IDENTIFIER_OK.search(assigned) or IDENTIFIER_OK.search(value):
            continue
        hits.append(assigned.strip())
    return hits


def test_no_secret_value_literal_in_any_tf_or_example():
    for f in list(tf_files()) + [TFVARS_EXAMPLE]:
        hits = secret_literals(f.read_text())
        assert not hits, (
            f"{f.relative_to(ROOT)}: secret-looking literal(s) {hits} — secret values belong in "
            "Secrets Manager, injected out-of-band, never in Terraform."
        )


# A scanner that has never caught anything is not evidence of a clean tree — it may simply not work.
# Feed it synthetic violations to prove it bites, and synthetic identifiers to prove it does not
# cry wolf on the ARNs/names the config legitimately carries.
def test_secret_scanner_catches_planted_violations():
    planted = [
        'resource "x" { access_key = "AKIAIOSFODNN7EXAMPLE" }',
        'variable "k" { default = "-----BEGIN RSA PRIVATE KEY-----\\nMIIE..." }',
        'db_password = "hunter2-not-a-real-password"',
        'auth_secret = "s3cr3t-value-here"',
        'api_key     = "sk-live-abcdef123456"',
    ]
    for snippet in planted:
        assert secret_literals(snippet), f"scanner MISSED a planted secret: {snippet!r}"


def test_secret_scanner_ignores_identifiers_and_prose():
    benign = [
        'secret_arns = { for k, v in aws_secretsmanager_secret.this : k => v.arn }',
        'name = "${var.name_prefix}/DATABASE_URL"',
        'secrets = [{ name = "AUTH_SECRET", valueFrom = local.arn }]',
        'db_master_username = "datumzero_migrator"',
        '# the password is AWS-managed; never put a real secret value in .tf',
        'policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"',
    ]
    for snippet in benign:
        assert not secret_literals(snippet), f"scanner cried wolf on an identifier: {snippet!r}"


def test_rds_master_password_is_aws_managed():
    """No password passes through Terraform, so none can land in .tf or in state."""
    body = strip_comments(RDS_TF.read_text())
    assert re.search(r"manage_master_user_password\s*=\s*true", body), (
        "RDS must use manage_master_user_password — otherwise the password is a Terraform input "
        "and lands in state"
    )
    assert not re.search(r"^\s*password\s*=", body, re.M), (
        "never pass a DB password through Terraform"
    )


# --- the RLS dual-role is not collapsible ---


def test_runtime_db_role_cannot_equal_the_master_role():
    """
    RLS does not apply to the owner/superuser. If the runtime connected as the master, every tenant
    policy would be bypassed and the breach would be invisible — so make it fail at plan time.
    """
    body = RDS_TF.read_text()
    app_var = re.search(r'variable\s+"db_app_username"\s*\{(.*?)\n\}', body, re.S)
    assert app_var, "rds module must declare db_app_username"
    block = app_var.group(1)
    assert "validation" in block, "db_app_username must carry a validation block"
    assert re.search(r"var\.db_app_username\s*!=\s*var\.db_master_username", block), (
        "the validation must assert runtime role != master/migration role (CR-20/CR-35)"
    )


# --- the data tier is private and encrypted ---


def test_database_is_private_and_encrypted():
    body = strip_comments(RDS_TF.read_text())
    assert re.search(r"publicly_accessible\s*=\s*false", body), "RDS must never be publicly accessible"
    assert re.search(r"storage_encrypted\s*=\s*true", body), "RDS storage must be encrypted at rest"
    assert re.search(r'name\s*=\s*"rds\.force_ssl"', body) and re.search(
        r'value\s*=\s*"1"', body
    ), "RDS must reject non-TLS connections (rds.force_ssl = 1)"


def test_redis_is_encrypted_and_never_evicts_jobs():
    body = strip_comments(REDIS_TF.read_text())
    assert re.search(r"at_rest_encryption_enabled\s*=\s*true", body)
    assert re.search(r"transit_encryption_enabled\s*=\s*true", body)
    policy = re.search(r'name\s*=\s*"maxmemory-policy"\s*\n\s*value\s*=\s*"([^"]+)"', body)
    assert policy, "Redis must pin maxmemory-policy explicitly"
    assert policy.group(1) == "noeviction", (
        "BullMQ requires noeviction: under any eviction policy Redis may drop job keys when memory "
        "fills, so an accepted upload would never be processed — fail-open. Fail loudly instead."
    )


def test_media_bucket_is_private_and_versioned():
    body = strip_comments(STORAGE_TF.read_text())
    for setting in (
        "block_public_acls",
        "block_public_policy",
        "ignore_public_acls",
        "restrict_public_buckets",
    ):
        assert re.search(rf"{setting}\s*=\s*true", body), f"media bucket must set {setting} = true"
    assert re.search(r"versioning_configuration\s*\{\s*\n\s*status\s*=\s*\"Enabled\"", body), (
        "the raw capture is the source of record for every measurement (CR-22) — keep versions"
    )
    assert "aws_s3_bucket_server_side_encryption_configuration" in body


# --- state and tfvars can never be committed ---


def test_gitignore_excludes_state_and_tfvars_but_keeps_the_lock():
    ig = GITIGNORE.read_text()
    assert "*.tfstate" in ig, "Terraform state must never be committed"
    assert "*.tfvars" in ig, "tfvars must never be committed"
    assert "!*.tfvars.example" in ig, "the tfvars example is the documented template — keep it tracked"
    assert "**/.terraform/" in ig, "the provider cache must not be committed"
    assert not re.search(r"^\s*\*?\.terraform\.lock\.hcl", ig, re.M), (
        "the lock file MUST stay committed — it is what pins provider versions deterministically"
    )
