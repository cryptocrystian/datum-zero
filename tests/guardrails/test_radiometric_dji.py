"""
Guardrail — the DJI Thermal SDK and its wrapper are CONFIDENTIAL (DJI EULA §14, CR-22) and must never
be committed. This checks git's tracked files (not just the working tree) so the confidential material
can never slip into history, and confirms the committed DJI glue carries no SDK bindings.

Run: pytest tests/guardrails -q
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DJI_GLUE = ROOT / "services/inference/app/radiometric/dji.py"

# Confidential DJI artifacts: the SDK wrapper module, a vendored SDK tree, or the DIRP native library.
CONFIDENTIAL = re.compile(r"(_dji_sdk_native|dji[-_]?thermal[-_]?sdk|libdirp|/dirp[./])", re.I)


def _tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True)
    return out.stdout.splitlines()


def test_no_dji_sdk_or_wrapper_is_git_tracked():
    offenders = [p for p in _tracked_files() if CONFIDENTIAL.search(p)]
    assert not offenders, (
        "DJI SDK/wrapper must NEVER be committed (DJI EULA §14, CR-22): " + ", ".join(offenders)
    )


def test_gitignore_excludes_the_confidential_dji_wrapper():
    gi = (ROOT / ".gitignore").read_text()
    assert "_dji_sdk_native" in gi, ".gitignore must exclude the confidential DJI wrapper (CR-22)"


def test_committed_dji_glue_carries_no_sdk_bindings():
    src = DJI_GLUE.read_text()
    # The real SDK call lives in the confidential wrapper; the committed glue only reaches the boundary.
    assert "_dji_sdk_native" in src, "glue must delegate to the confidential, env-pathed wrapper"
    for banned in ("ctypes", "cdll", "CDLL", "dlopen"):
        assert banned not in src, f"SDK bindings ({banned!r}) belong in the confidential wrapper, not committed glue"
