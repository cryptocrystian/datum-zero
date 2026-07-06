import { createHash } from "node:crypto";
import { prisma, Prisma } from "@dz/db";
import { renderWorkOrder, validateWorkOrder, type RenderContext } from "@dz/adapters";
import { assertApprovedForDispatch, DispatchGateError } from "./gate";
import { enqueueDispatch } from "./queue";

/** Stable dispatch id from the idempotency key so re-dispatch upserts the same row. */
function deterministicUuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const num = (x: unknown): number | null => (x == null ? null : Number(x));

/**
 * The SINGLE server-side dispatch entry point (CR-12). Enforces the 100% QA gate, then — for each
 * active GENERIC_WEBHOOK integration — renders + validates the canonical payload, persists an
 * idempotent WorkOrderDispatch, and enqueues delivery via BullMQ. Org-scoped throughout.
 *
 * Only GENERIC_WEBHOOK is delivered in M0-09; other targets register behind the same adapter
 * interface (NATIVE_JIRA is M0-10).
 */
export async function dispatchAnomaly(
  anomalyId: string,
  organizationId: string,
): Promise<{ dispatched: number }> {
  const anomaly = await prisma.anomaly.findFirst({
    where: { id: anomalyId, organizationId },
    select: {
      id: true,
      status: true,
      reviewedById: true,
      reviewedAt: true,
      spatialBindingStatus: true,
      latitude: true,
      longitude: true,
      confidenceScore: true,
      metricDelta: true,
      metricUnit: true,
      classification: true,
      recommendation: true,
      standardRef: true,
      modelVersion: true,
      boundingBox: true,
      visualCropUrl: true,
      analyticsCropUrl: true,
      asset: {
        select: { internalLabel: true, latitude: true, longitude: true, cadObjectId: true, erpAssetId: true, procoreLocationId: true },
      },
      mediaAsset: {
        select: { capturedAt: true, ingestionSession: { select: { id: true, modality: true, isNdaaVerified: true } } },
      },
    },
  });
  if (!anomaly) throw new DispatchGateError("QA gate: anomaly not found in org — dispatch refused.");

  // Server-enforced 100% gate — unapproved / unbound never proceeds past this line (CR-12).
  assertApprovedForDispatch(anomaly);
  if (!anomaly.asset || !anomaly.reviewedById || !anomaly.reviewedAt) {
    throw new DispatchGateError("QA gate: approved anomaly is missing asset/reviewer — dispatch refused.");
  }

  const integrations = await prisma.integration.findMany({
    where: { organizationId, isActive: true, targetType: "GENERIC_WEBHOOK" },
    select: { id: true },
  });

  const emittedAt = new Date().toISOString();
  let dispatched = 0;

  for (const integration of integrations) {
    const idempotencyKey = `${anomalyId}:${integration.id}`;
    const dispatchId = deterministicUuid(idempotencyKey);

    const externalIds: Record<string, string | number> = {};
    if (anomaly.asset.cadObjectId) externalIds.cad_object_id = anomaly.asset.cadObjectId;
    if (anomaly.asset.erpAssetId) externalIds.erp_asset_id = anomaly.asset.erpAssetId;
    if (anomaly.asset.procoreLocationId != null) externalIds.procore_location_id = anomaly.asset.procoreLocationId;

    const ctx: RenderContext = {
      dispatchId,
      idempotencyKey,
      organizationId,
      emittedAt,
      anomaly: {
        latitude: num(anomaly.latitude),
        longitude: num(anomaly.longitude),
        confidenceScore: anomaly.confidenceScore,
        metricDelta: anomaly.metricDelta,
        metricUnit: anomaly.metricUnit,
        classification: anomaly.classification,
        recommendation: anomaly.recommendation,
        standardRef: anomaly.standardRef,
        modelVersion: anomaly.modelVersion,
        reviewedById: anomaly.reviewedById,
        reviewedAt: anomaly.reviewedAt.toISOString(),
        boundingBox: anomaly.boundingBox,
        visualCropUrl: anomaly.visualCropUrl,
        analyticsCropUrl: anomaly.analyticsCropUrl,
      },
      asset: {
        internalLabel: anomaly.asset.internalLabel,
        latitude: num(anomaly.asset.latitude),
        longitude: num(anomaly.asset.longitude),
        externalIds,
      },
      capture: {
        modality: anomaly.mediaAsset.ingestionSession.modality,
        capturedAt: anomaly.mediaAsset.capturedAt.toISOString(),
        ndaaVerified: anomaly.mediaAsset.ingestionSession.isNdaaVerified,
        ingestionSessionId: anomaly.mediaAsset.ingestionSession.id,
      },
    };

    const payload = renderWorkOrder(ctx);
    // Fail closed at creation if the payload is not schema-valid (evidence-framed guard included).
    validateWorkOrder(payload);

    // Idempotent: re-dispatch never disturbs an in-flight/resolved WorkOrderDispatch.
    await prisma.workOrderDispatch.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        id: dispatchId,
        organizationId,
        anomalyId,
        integrationId: integration.id,
        payload: payload as unknown as Prisma.InputJsonValue,
        idempotencyKey,
      },
    });

    await enqueueDispatch(dispatchId);
    dispatched += 1;
  }

  return { dispatched };
}
