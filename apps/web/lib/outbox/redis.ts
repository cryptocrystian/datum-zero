import IORedis from "ioredis";
import type { ConnectionOptions } from "bullmq";

/** Shared Redis connection for the BullMQ outbox (CR: rate-limited, idempotent delivery). */
export const DISPATCH_QUEUE = "work-order-dispatch";

let connection: IORedis | undefined;

export function getRedis(): IORedis {
  if (!connection) {
    // maxRetriesPerRequest: null is required by BullMQ workers.
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

/** Same connection, typed for BullMQ (bridges the ioredis minor-version type skew; runtime-safe). */
export function bullConnection(): ConnectionOptions {
  return getRedis() as unknown as ConnectionOptions;
}
