"""
Guardrails for M2-6a — containerization + compose parity (CR-35).

  • the runtime images run NON-ROOT and expose a health check;
  • NO secret is baked into an image layer (no .env COPY, no secret-looking ENV/ARG);
  • the compose runtime tier (web, workers) connects as the NON-SUPERUSER datumzero_app — the RLS
    dual-role is NOT collapsed — while only the one-shot migrate uses the elevated role;
  • the fail-closed non-superuser boot check exists and is wired into the worker.

(The DJI-SDK-not-in-a-layer assertions live in test_radiometric_dji.py.)

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
WEB_DF = ROOT / "apps/web/Dockerfile"
INFER_DF = ROOT / "services/inference/Dockerfile"
DOCKERIGNORE = ROOT / ".dockerignore"
COMPOSE = ROOT / "docker-compose.yml"
DB_INDEX = ROOT / "packages/db/src/index.ts"
WORKER_MAIN = ROOT / "apps/web/lib/outbox/worker-main.ts"
DOCKERFILES = [WEB_DF, INFER_DF]

SECRETISH = re.compile(r"(SECRET|PASSWORD|PRIVATE_KEY|API_?KEY|ACCESS_KEY|_TOKEN)", re.I)


def test_dockerfiles_run_non_root():
    for df in DOCKERFILES:
        users = [ln.split()[1] for ln in df.read_text().splitlines() if ln.strip().startswith("USER ")]
        assert users, f"{df.name} must drop to a non-root USER"
        assert users[-1] not in ("root", "0"), f"{df.name} must not run as root at runtime"


def test_dockerfiles_have_healthchecks():
    for df in DOCKERFILES:
        assert "HEALTHCHECK" in df.read_text(), f"{df.name} must define a HEALTHCHECK"


def test_no_secret_baked_into_images():
    for df in DOCKERFILES:
        for line in df.read_text().splitlines():
            s = line.strip()
            if s.startswith("#"):
                continue
            if s.startswith(("COPY", "ADD")):
                assert ".env" not in s, f"{df.name}: never COPY a .env into an image layer (CR-35)"
            if s.startswith(("ENV", "ARG")) and "=" in s:
                assert not SECRETISH.search(s), f"{df.name}: secret-looking build var baked into a layer: {s!r}"
    di = DOCKERIGNORE.read_text()
    assert ".env" in di, ".dockerignore must exclude env files from the build context"
    assert ".claude/" in di, ".dockerignore must exclude local agent config"


def test_runtime_uses_non_superuser_role_not_collapsed():
    services = yaml.safe_load(COMPOSE.read_text())["services"]
    for name in ("web", "workers"):
        url = services[name]["environment"]["DATABASE_URL"]
        user = url.split("://", 1)[1].split(":", 1)[0]
        assert user == "datumzero_app", f"{name} runtime must connect as datumzero_app (RLS enforced), got {user!r}"
    migrate_user = services["migrate"]["environment"]["DATABASE_URL"].split("://", 1)[1].split(":", 1)[0]
    assert migrate_user != "datumzero_app", "migrate must run as the elevated role (it creates datumzero_app)"


def test_non_superuser_boot_check_exists_and_is_wired():
    idx = DB_INDEX.read_text()
    assert "assertRuntimeRoleNotSuperuser" in idx, "the non-superuser boot check must exist in @dz/db"
    assert "rolsuper" in idx, "the boot check must query the superuser flag"
    assert "throw new Error" in idx, "the boot check must FAIL CLOSED (throw), never warn"
    assert "assertRuntimeRoleNotSuperuser" in WORKER_MAIN.read_text(), "the worker must run the boot check at start"
