/**
 * Generic Delivery Adapter Suite — one routing interface behind which every target sits (CR-05).
 * GENERIC_WEBHOOK is implemented in M0-09; NATIVE_JIRA (M0-10) and the rest register against the
 * SAME interface. Every adapter delivers the identical canonical, evidence-framed payload.
 */

export interface DeliveryResult {
  ok: boolean;
  status: number;
  /** External ticket/ref id returned by the target, if any (WorkOrderDispatch.downstreamRef). */
  downstreamRef: string | null;
  /** True when the caller should retry (5xx / 429 / network); false for a hard client rejection. */
  retryable: boolean;
}

/**
 * A delivery destination. `config` is the Integration.config Json (endpoint URL, project key, field
 * mappings — NEVER secrets). `secretVaultKey` references the secret (AWS Secrets Manager; env-backed
 * in dev) — credentials are resolved from the vault, never read from the DB (MANIFEST §3).
 */
export interface DeliveryTarget {
  config: unknown;
  secretVaultKey: string | null;
}

export interface DeliveryAdapter {
  readonly targetType: string;
  deliver(
    payload: unknown,
    target: DeliveryTarget,
    opts?: { timeoutMs?: number },
  ): Promise<DeliveryResult>;
}

/** Everything the canonical render needs. Assembled org-scoped from an approved, BOUND anomaly. */
export interface RenderContext {
  dispatchId: string;
  idempotencyKey: string;
  organizationId: string;
  emittedAt: string;
  anomaly: {
    latitude: number | null;
    longitude: number | null;
    confidenceScore: number; // 0..1
    metricDelta: number;
    metricUnit: string | null;
    classification: string | null;
    recommendation: string | null;
    standardRef: string | null;
    modelVersion: string | null;
    reviewedById: string;
    reviewedAt: string;
    boundingBox: number[];
    visualCropUrl: string;
    analyticsCropUrl: string;
  };
  asset: {
    internalLabel: string;
    latitude: number | null;
    longitude: number | null;
    externalIds?: Record<string, string | number>;
  };
  capture: {
    modality: string;
    capturedAt: string;
    ndaaVerified: boolean;
    ingestionSessionId: string | null;
  };
}
