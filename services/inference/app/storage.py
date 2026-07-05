"""
Python-side parity for the TS `@dz/storage` StoragePort (MANIFEST §3).

The inference service reads raw captures and writes crops through the SAME object store the web
tier uses — MinIO/S3 by default, local filesystem as a dev fallback — honoring identical keys and
the `s3://bucket/key` / `local://key` locator format so paths round-trip across services.

Storage-driver selection is dev ergonomics, NOT a fail-closed surface.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol, runtime_checkable


@runtime_checkable
class StoragePort(Protocol):
    driver: str

    def get(self, key: str) -> bytes: ...

    def put(self, key: str, data: bytes, content_type: str | None = None) -> str: ...


def locator_to_key(locator: str) -> str:
    """Parse a stored locator ('s3://bucket/key' or 'local://key') back to its object key."""
    if locator.startswith("s3://"):
        _, _, key = locator[len("s3://") :].partition("/")
        return key
    if locator.startswith("local://"):
        return locator[len("local://") :]
    return locator.lstrip("/")


class LocalStorage:
    driver = "local"

    def __init__(self, root: str):
        self.root = Path(root).resolve()

    def _resolve(self, key: str) -> Path:
        full = (self.root / key).resolve()
        if full != self.root and self.root not in full.parents:
            raise ValueError(f"object key escapes the storage root: {key}")
        return full

    def get(self, key: str) -> bytes:
        return self._resolve(key).read_bytes()

    def put(self, key: str, data: bytes, content_type: str | None = None) -> str:
        full = self._resolve(key)
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(data)
        return f"local://{key}"


class S3Storage:
    driver = "s3"

    def __init__(
        self,
        bucket: str,
        region: str,
        endpoint: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        force_path_style: bool = True,
    ):
        self.bucket = bucket
        self._cfg = dict(
            region=region,
            endpoint=endpoint,
            access_key=access_key,
            secret_key=secret_key,
            force_path_style=force_path_style,
        )
        self._client = None

    def _c(self):
        if self._client is None:
            import boto3  # lazy — only the s3 driver needs the SDK
            from botocore.config import Config

            self._client = boto3.client(
                "s3",
                region_name=self._cfg["region"],
                endpoint_url=self._cfg["endpoint"],
                aws_access_key_id=self._cfg["access_key"],
                aws_secret_access_key=self._cfg["secret_key"],
                config=Config(
                    s3={"addressing_style": "path" if self._cfg["force_path_style"] else "auto"}
                ),
            )
        return self._client

    def get(self, key: str) -> bytes:
        return self._c().get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def put(self, key: str, data: bytes, content_type: str | None = None) -> str:
        extra = {"ContentType": content_type} if content_type else {}
        self._c().put_object(Bucket=self.bucket, Key=key, Body=data, **extra)
        return f"s3://{self.bucket}/{key}"


def get_storage(env: dict | None = None) -> StoragePort:
    env = env if env is not None else os.environ
    driver = (env.get("STORAGE_DRIVER") or "s3").lower()
    local_root = env.get("STORAGE_LOCAL_ROOT") or ".data/object-store"

    if driver == "local":
        return LocalStorage(local_root)

    bucket = env.get("S3_BUCKET")
    if not bucket:
        # Graceful fallback so the service runs without MinIO/S3 configured.
        return LocalStorage(local_root)

    return S3Storage(
        bucket=bucket,
        region=env.get("S3_REGION", "us-east-1"),
        endpoint=env.get("S3_ENDPOINT"),
        access_key=env.get("S3_ACCESS_KEY_ID"),
        secret_key=env.get("S3_SECRET_ACCESS_KEY"),
        force_path_style=(env.get("S3_FORCE_PATH_STYLE") == "true") or bool(env.get("S3_ENDPOINT")),
    )
