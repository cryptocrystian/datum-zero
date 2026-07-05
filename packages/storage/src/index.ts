import { LocalStorage } from "./local-storage";
import { S3Storage } from "./s3-storage";
import type { StoragePort } from "./port";

export * from "./port";
export { S3Storage } from "./s3-storage";
export type { S3StorageConfig } from "./s3-storage";
export { LocalStorage } from "./local-storage";
export type { LocalStorageConfig } from "./local-storage";

let singleton: StoragePort | undefined;

/**
 * Resolve the active StoragePort from the environment.
 *
 *   STORAGE_DRIVER = "s3" (default) → MinIO/S3. Needs S3_BUCKET (+ endpoint/creds for MinIO).
 *   STORAGE_DRIVER = "local"        → local filesystem under STORAGE_LOCAL_ROOT (dev fallback).
 *
 * If "s3" is selected but no bucket is configured we fall back to local, so a fresh clone
 * boots without MinIO. (Storage selection is dev ergonomics — NOT the fail-closed surface.)
 */
export function getStoragePort(
  env: Record<string, string | undefined> = process.env,
): StoragePort {
  const driver = (env.STORAGE_DRIVER ?? "s3").toLowerCase();
  const localRoot = env.STORAGE_LOCAL_ROOT ?? ".data/object-store";

  if (driver === "local") {
    return new LocalStorage({ root: localRoot });
  }

  const bucket = env.S3_BUCKET;
  if (!bucket) {
    // Graceful fallback so the app still boots when MinIO/S3 isn't configured.
    return new LocalStorage({ root: localRoot });
  }

  return new S3Storage({
    bucket,
    region: env.S3_REGION ?? "us-east-1",
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true" || Boolean(env.S3_ENDPOINT),
  });
}

/** Process-wide singleton (mirrors the Prisma client pattern in @dz/db). */
export function storage(): StoragePort {
  if (!singleton) singleton = getStoragePort();
  return singleton;
}
