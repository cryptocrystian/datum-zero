import type { PutObjectInput, StoragePort, StoredObject } from "./port";
import { StorageConfigError } from "./port";

/**
 * S3-backed StoragePort — the DEFAULT driver.
 *
 * Works against MinIO locally (endpoint + path-style) and AWS S3 in prod (IAM role via the
 * default credential provider chain — no static keys). The AWS SDK is imported LAZILY so the
 * local-filesystem fallback never needs the dependency installed or bundled.
 */
export interface S3StorageConfig {
  bucket: string;
  region: string;
  /** MinIO endpoint, e.g. "http://localhost:9000". Omit for real AWS S3. */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Path-style addressing — required for MinIO. */
  forcePathStyle?: boolean;
}

export class S3Storage implements StoragePort {
  readonly driver = "s3";
  private readonly cfg: S3StorageConfig;
  private clientPromise?: Promise<unknown>;

  constructor(cfg: S3StorageConfig) {
    if (!cfg.bucket) throw new StorageConfigError("S3 storage requires a bucket");
    this.cfg = cfg;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async client(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { S3Client } = await import("@aws-sdk/client-s3");
        return new S3Client({
          region: this.cfg.region,
          endpoint: this.cfg.endpoint,
          forcePathStyle: this.cfg.forcePathStyle ?? Boolean(this.cfg.endpoint),
          // With no static keys, fall back to the AWS default provider chain (IAM role in prod).
          credentials:
            this.cfg.accessKeyId && this.cfg.secretAccessKey
              ? { accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey }
              : undefined,
        });
      })();
    }
    return this.clientPromise;
  }

  storagePath(key: string): string {
    return `s3://${this.cfg.bucket}/${key}`;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
    const res = await client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    );
    return {
      key: input.key,
      storagePath: this.storagePath(input.key),
      size: body.byteLength,
      etag: res?.ETag,
    };
  }

  async get(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const res = await client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return true;
    } catch (e: unknown) {
      const err = e as { $metadata?: { httpStatusCode?: number }; name?: string };
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return false;
      throw e;
    }
  }
}
