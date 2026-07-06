import { prisma } from "@dz/db";
import { assertApprovedForDispatch, DispatchGateError } from "./gate";

/**
 * The SINGLE server-side dispatch entry point (CR-12). Any dispatch of an anomaly MUST come through
 * here; it enforces the 100% QA gate before anything leaves the system, then hands off to the outbox.
 *
 * The actual WorkOrderDispatch enqueue (BullMQ + the delivery adapters) is M0-09 — this is the
 * handoff point. Until then the gate is fully real: an unapproved anomaly can never dispatch.
 */
export async function dispatchAnomaly(anomalyId: string, organizationId: string): Promise<void> {
  // Tenant-scoped read (multi-tenant native).
  const anomaly = await prisma.anomaly.findFirst({
    where: { id: anomalyId, organizationId },
    select: { status: true, reviewedById: true, reviewedAt: true, spatialBindingStatus: true },
  });
  if (!anomaly) {
    throw new DispatchGateError("QA gate: anomaly not found in org — dispatch refused.");
  }

  // Server-enforced 100% gate — unapproved never proceeds past this line.
  assertApprovedForDispatch(anomaly);

  // --- M0-09 HANDOFF: create WorkOrderDispatch rows per active Integration and enqueue via BullMQ.
  throw new DispatchGateError("outbox dispatch is implemented in M0-09 (handoff point).");
}
