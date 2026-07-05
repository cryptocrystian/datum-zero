import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PutObjectInput, StoragePort, StoredObject } from "./port";
import { StorageConfigError } from "./port";

/**
 * Filesystem-backed StoragePort — the dev FALLBACK when no MinIO/S3 is configured.
 *
 * Each object key maps to a file under `root`. Keys are validated so they can never escape
 * the storage root (no path traversal).
 */
export interface LocalStorageConfig {
  /** Root dir (absolute, or resolved against cwd) that all objects live under. */
  root: string;
}

export class LocalStorage implements StoragePort {
  readonly driver = "local";
  private readonly root: string;

  constructor(cfg: LocalStorageConfig) {
    if (!cfg.root) throw new StorageConfigError("Local storage requires a root directory");
    this.root = path.resolve(cfg.root);
  }

  private resolveKey(key: string): string {
    const full = path.resolve(this.root, key);
    const rel = path.relative(this.root, full);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new StorageConfigError(`Refusing object key that escapes the storage root: ${key}`);
    }
    return full;
  }

  storagePath(key: string): string {
    return `local://${key}`;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const full = this.resolveKey(input.key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
    await fs.writeFile(full, body);
    const etag = createHash("md5").update(body).digest("hex");
    return { key: input.key, storagePath: this.storagePath(input.key), size: body.byteLength, etag };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }
}
