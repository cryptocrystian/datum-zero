"""
Unit tests for the CI image-layer scanner (M2-6b, CR-35). Proves the scanner LOGIC catches a DJI SDK
artifact / a baked secret in a layer — so the CI job that runs it against real `docker save` output is
a genuine gate, not a static approximation. No Docker needed here (synthetic docker-save tarballs).

Run: pytest tests/guardrails -q
"""
import io
import sys
import tarfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/ci"))
from scan_image_layers import scan_tar  # noqa: E402


def _layer(files: dict[str, bytes]) -> bytes:
    """A single image layer: a tar of {path: content}."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as t:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            t.addfile(info, io.BytesIO(content))
    return buf.getvalue()


def _docker_save(layers: list[bytes], tmp: Path) -> str:
    """A docker-save-shaped outer tar: a manifest + the given layer tars."""
    out = tmp / "image.tar"
    with tarfile.open(out, mode="w") as outer:
        manifest = b'[{"Config":"config.json","Layers":["l0/layer.tar"]}]'
        mi = tarfile.TarInfo("manifest.json")
        mi.size = len(manifest)
        outer.addfile(mi, io.BytesIO(manifest))
        for i, layer in enumerate(layers):
            li = tarfile.TarInfo(f"l{i}/layer.tar")
            li.size = len(layer)
            outer.addfile(li, io.BytesIO(layer))
    return str(out)


def test_clean_image_passes(tmp_path):
    tar = _docker_save([_layer({"app/main.py": b"print('ok')", "app/models/m.onnx": b"\x00\x01"})], tmp_path)
    assert scan_tar(tar) == []


def test_dji_wrapper_in_a_layer_is_caught(tmp_path):
    tar = _docker_save([_layer({"svc/app/radiometric/_dji_sdk_native.py": b"x = 1"})], tmp_path)
    v = scan_tar(tar)
    assert v and any("DJI SDK artifact" in s for s in v)


def test_dji_vendored_sdk_and_libdirp_are_caught(tmp_path):
    tar = _docker_save([
        _layer({"opt/dji-thermal-sdk/dirp.h": b"//"}),
        _layer({"usr/lib/libdirp.so": b"\x7fELF"}),
    ], tmp_path)
    v = scan_tar(tar)
    assert len([s for s in v if "DJI SDK artifact" in s]) >= 2


def test_env_file_in_a_layer_is_caught(tmp_path):
    tar = _docker_save([_layer({"app/.env": b"DATABASE_URL=postgres://x"})], tmp_path)
    v = scan_tar(tar)
    assert v and any("env file baked" in s for s in v)


def test_secret_literal_in_a_config_file_is_caught(tmp_path):
    tar = _docker_save([_layer({"app/config.json": b'{"SES_SMTP_PASSWORD": "s3cr3t-value-123"}'})], tmp_path)
    v = scan_tar(tar)
    assert v and any("secret literal" in s for s in v)


def test_real_aws_key_in_source_is_caught(tmp_path):
    tar = _docker_save([_layer({"app/leak.ts": b'const k = "AKIAIOSFODNN7EXAMPLE";'})], tmp_path)
    v = scan_tar(tar)
    assert v and any("credential value" in s for s in v)


def test_pem_private_key_is_caught(tmp_path):
    tar = _docker_save([_layer({"app/id_rsa": b"-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n"})], tmp_path)
    v = scan_tar(tar)
    assert v and any("credential value" in s for s in v)


def test_source_referencing_env_var_name_is_not_flagged(tmp_path):
    # Regression for the first real CI run: source MUST name env vars to read them — not a secret.
    src = b"const t = process.env.AUTH_SECRET;\nif (x !== process.env.INFERENCE_CALLBACK_TOKEN) {}\n"
    tar = _docker_save([_layer({"apps/web/app/api/v1/inference/callback/route.ts": src})], tmp_path)
    assert scan_tar(tar) == []


def test_node_modules_type_decl_is_not_flagged(tmp_path):
    # next-auth ships `AUTH_SECRET: string` type decls — third-party, not our secret.
    tar = _docker_save([_layer({"repo/node_modules/next-auth/index.d.ts": b"interface E { AUTH_SECRET: string }"})], tmp_path)
    assert scan_tar(tar) == []


def test_ok_files_without_secrets_pass(tmp_path):
    # A source file that merely NAMES an env var (no baked value) is fine.
    tar = _docker_save([_layer({"app/secrets.js": b"const p = process.env.SES_SMTP_PASSWORD;"})], tmp_path)
    assert scan_tar(tar) == []
