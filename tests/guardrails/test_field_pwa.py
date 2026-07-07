"""
Guardrails for M1-04 — Infield Validator PWA shell + client file intake (CR-11).

Asserts:
  • the /field surface is auth-gated (its layout validates the session and redirects);
  • the PWA manifest + service worker exist and the SW handles fetch (offline shell);
  • no CR-11-prohibited claims (live Remote-ID capture/verification, in-browser NDAA attestation)
    appear anywhere in the field UI copy — the field tool is data-integrity + hardware screening.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
FIELD = WEB / "app/field"
FIELD_LAYOUT = FIELD / "layout.tsx"
MANIFEST = WEB / "public/manifest.webmanifest"
SW = WEB / "public/sw.js"
OFFLINE = WEB / "public/offline.html"

# CR-11: the Infield Validator must NOT claim live Remote-ID capture/verification or in-browser NDAA
# attestation. NDAA/airframe compliance is a server-side registry serial-match, never in the browser.
PROHIBITED = [
    re.compile(r"remote[\s-]?id", re.I),
    re.compile(r"\bndaa\b", re.I),
    re.compile(r"in[\s-]?browser[\s\S]{0,40}attest", re.I),
    re.compile(r"live[\s\S]{0,20}remote", re.I),
]


def _field_copy_files():
    files = list(FIELD.rglob("*.tsx")) + list(FIELD.rglob("*.ts"))
    files.append(OFFLINE)  # the offline shell is field-facing copy too
    return [f for f in files if f.exists()]


def test_field_route_is_auth_gated():
    assert FIELD_LAYOUT.exists(), "the /field route must have a layout that gates it"
    src = FIELD_LAYOUT.read_text()
    assert "getSession" in src, "the field layout must validate the real session (auth() → DB)"
    assert "redirect(" in src, "the field layout must redirect an unauthenticated visitor"


def test_pwa_manifest_exists_and_is_valid():
    assert MANIFEST.exists(), "public/manifest.webmanifest must exist"
    import json

    data = json.loads(MANIFEST.read_text())
    assert data.get("start_url", "").startswith("/field"), "the PWA must start at the field route"
    assert data.get("display") in {"standalone", "fullscreen", "minimal-ui"}, "PWA must be installable (display mode)"
    assert data.get("icons"), "the manifest must declare icons"


def test_service_worker_exists_with_offline_shell():
    assert SW.exists(), "public/sw.js must exist"
    src = SW.read_text()
    assert "addEventListener" in src and "fetch" in src, "the SW must handle fetch (installability + offline)"
    assert "offline.html" in src, "the SW must serve the offline app shell"
    assert OFFLINE.exists(), "the offline app shell (public/offline.html) must exist"


def test_no_cr11_prohibited_claims_in_field_copy():
    offenders = []
    for f in _field_copy_files():
        text = f.read_text(errors="ignore")
        for pat in PROHIBITED:
            if pat.search(text):
                offenders.append(f"{f.relative_to(ROOT)} :: /{pat.pattern}/")
    assert not offenders, "CR-11-prohibited claim in field UI copy:\n" + "\n".join(offenders)
