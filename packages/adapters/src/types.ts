/**
 * Generic Delivery Adapter Suite — one routing interface behind which every target sits (CR-05).
 * GENERIC_WEBHOOK is implemented in M0-09; NATIVE_JIRA (M0-10) and the rest register against the
 * SAME interface. Every adapter delivers the identical canonical, evidence-framed payload.
 *
 * M2-PREP (CR-21): the interface now treats enterprise transport as first-class so a future
 * SAP-OData or Maximo-OSLC adapter slots in behind this same seam without straining it —
 * (1) an `authStrategy` (static token / OAuth2 client-credentials / mTLS), and (2) optional
 * async/batch dispatch. Credentials ALWAYS resolve via `secretVaultKey` → secrets vault, never the DB.
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
 * How an adapter authenticates to its target. This is CONFIG (mechanism + non-secret params) — the
 * actual credential is fetched at dispatch time from `DeliveryTarget.secretVaultKey` → secrets vault,
 * never stored in or read from the DB (MANIFEST §3, CR-03).
 *  - STATIC_TOKEN: a bearer/API token held in the vault (generic webhook, MaintainX, Jira).
 *  - OAUTH2_CLIENT_CREDENTIALS: machine-to-machine token grant (SAP Gateway, Maximo MAS).
 *  - MTLS: mutual-TLS client certificate (hardened enterprise gateways); cert material in the vault.
 */
export type AuthStrategy =
  | { kind: "STATIC_TOKEN" }
  | { kind: "OAUTH2_CLIENT_CREDENTIALS"; tokenUrl: string; scopes?: string[] }
  | { kind: "MTLS" };

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
  /**
   * How this target authenticates. Omit to default to STATIC_TOKEN (the generic webhook + Jira today).
   * Enterprise adapters declare OAuth2/mTLS here; the credential still comes only from secretVaultKey.
   */
  readonly authStrategy?: AuthStrategy;
  /** True for OData/OSLC-style targets that prefer async/batch dispatch (see `deliverBatch`). */
  readonly supportsBatch?: boolean;
  deliver(
    payload: unknown,
    target: DeliveryTarget,
    opts?: { timeoutMs?: number },
  ): Promise<DeliveryResult>;
  /**
   * Optional batch/async dispatch for enterprise transports (SAP-OData $batch, Maximo-OSLC bulk).
   * One result per payload, in order. Adapters that only do single dispatch omit this.
   */
  deliverBatch?(
    payloads: unknown[],
    target: DeliveryTarget,
    opts?: { timeoutMs?: number },
  ): Promise<DeliveryResult[]>;
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
