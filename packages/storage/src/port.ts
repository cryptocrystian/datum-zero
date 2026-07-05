/**
 * StoragePort — the single seam ALL object storage goes through (MANIFEST §3).
 *
 * The rest of the platform never talks to a storage SDK directly; it depends only on this
 * interface. Two implementations back it:
 *   • S3Storage    (s3-storage.ts)    — MinIO locally, AWS S3 in prod. The DEFAULT.
 *   • LocalStorage (local-storage.ts) — a filesystem FALLBACK for dev without MinIO.
 *
 * Both HOT-tier crops and COLD-tier raw masters are written through here (MANIFEST §3).
 *
 * NOTE: storage-driver selection is a dev-ergonomics concern, NOT a fail-closed surface.
 * The fail-closed rule in this subsystem is airframe binding (CR-11), enforced in the
 * ingestion route — never here.
 */

export interface PutObjectInput {
  /** Object key, e.g. "org/<id>/ingest/<session>/<file>". No leading slash. */
  key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
  /** Small, non-secret object metadata only — never secret material (MANIFEST §3). */
  metadata?: Record<string, string>;
}

export interface StoredObject {
  key: string;
  /**
   * Canonical, driver-qualified locator persisted in the DB
   * (IngestionSession.rawStoragePath / MediaAsset.fullStoragePath).
   * e.g. "s3://datum-zero-dev/org/.../capture.tiff" or "local://org/.../capture.tiff".
   */
  storagePath: string;
  size: number;
  etag?: string;
}

export interface StoragePort {
  /** Stable driver id for logs/audit trails: "s3" | "local". */
  readonly driver: string;
  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}
