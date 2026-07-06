import type { QueueStatus, SpatialBindingStatus } from "@dz/db";

/**
 * The 100% human-QA gate (CR-12) — PURE and throwing so it is unit-testable and cannot be bypassed.
 *
 * Dispatch is IMPOSSIBLE without a recorded human approval: a reviewer id + timestamp, an
 * APPROVED_DISPATCHED status, and a spatial binding (an unbound anomaly has no asset to route to,
 * CR-13). Type-only enum imports keep this module free of any runtime/DB dependency.
 */
export class DispatchGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchGateError";
  }
}

export interface DispatchGateInput {
  status: QueueStatus;
  reviewedById: string | null;
  reviewedAt: Date | null;
  spatialBindingStatus: SpatialBindingStatus;
}

export function assertApprovedForDispatch(a: DispatchGateInput): void {
  if (!a.reviewedById || !a.reviewedAt) {
    throw new DispatchGateError("QA gate: anomaly has no reviewer — dispatch refused (CR-12).");
  }
  if (a.status !== "APPROVED_DISPATCHED") {
    throw new DispatchGateError(
      `QA gate: status ${a.status} is not APPROVED_DISPATCHED — dispatch refused (CR-12).`,
    );
  }
  if (a.spatialBindingStatus !== "BOUND") {
    throw new DispatchGateError("QA gate: anomaly is not spatially bound — dispatch refused (CR-13).");
  }
}
