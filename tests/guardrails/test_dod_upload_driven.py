"""
Guardrail (M2-7c) — a test may not call itself DoD / end-to-end unless it drives a REAL upload.

The synthetic-callback shortcut — an in-process test that STARTED at the inference callback while
claiming "Definition of Done / end-to-end" — hid the missing ingestion→inference trigger for an entire
project of green CI. It does not come back: any DoD/end-to-end test TITLE must POST to the upload route.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
E2E = ROOT / "apps/web/e2e"
COMPOSED = E2E / "composed-dod.composed.e2e.ts"
UPLOAD = "/api/v1/ingestion/upload"

# "end-to-end" is used generically (auth sign-in, data-quality) — the claim that hid the missing
# trigger was specifically calling an in-process test the "DoD" / "Definition of Done".
TITLE = re.compile(r"(?:describe|it)\(\s*[\"'`]([^\"'`]+)")
DOD_CLAIM = re.compile(r"definition of done|\bDoD\b", re.I)


def _titles(src: str):
    return TITLE.findall(src)


def test_composed_dod_is_the_real_upload_driven_dod():
    src = COMPOSED.read_text()
    assert UPLOAD in src, "the real-trigger DoD must POST to the upload route"
    assert any(DOD_CLAIM.search(t) for t in _titles(src)), "the composed test titles must claim the DoD"


def test_no_dod_title_without_a_real_upload():
    for f in sorted(E2E.glob("*.e2e.ts")):
        src = f.read_text()
        claims = [t for t in _titles(src) if DOD_CLAIM.search(t)]
        if claims:
            assert UPLOAD in src, f"{f.name} has a DoD/end-to-end title {claims} but drives no real upload"


def test_former_dod_renamed_and_declaimed():
    assert not (E2E / "dod.e2e.ts").exists(), "dod.e2e.ts must be renamed — it started at the callback, not an upload"
    pc = E2E / "post-callback-pipeline.e2e.ts"
    assert pc.exists(), "the in-process test must be relabeled to post-callback-pipeline"
    assert not any(DOD_CLAIM.search(t) for t in _titles(pc.read_text())), \
        "the post-callback test titles must NOT claim DoD/end-to-end (it starts at the callback)"
