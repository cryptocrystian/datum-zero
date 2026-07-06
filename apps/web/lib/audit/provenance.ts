import { prisma } from "@dz/db";

/**
 * M0-11 — audit provenance readback (CR-12).
 *
 * Given a WorkOrderDispatch id, reconstruct the ENTIRE determination chain in ONE org-scoped call:
 * source image → detection (model + metrics) → asset binding → rule hit → human review → dispatch.
 * A client will contest a finding, and we must show exactly how it was made — immutable, complete.
 */

type Decimalish = number | { toNumber(): number } | null;
const num = (x: Decimalish): number | null =>
  x == null ? null : typeof x === "number" ? x : x.toNumber();
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export interface ProvenanceRow {
  id: string;
  downstreamRef: string | null;
  idempotencyKey: string;
  isResolved: boolean;
  lastStatus: number | null;
  attempts: number;
  createdAt: Date;
  integration: { targetType: string; displayName: string };
  anomaly: {
    id: string;
    confidenceScore: number;
    metricDelta: number;
    metricUnit: string | null;
    modelVersion: string | null;
    classification: string | null;
    standardRef: string | null;
    recommendation: string | null;
    boundingBox: number[];
    latitude: Decimalish;
    longitude: Decimalish;
    visualCropUrl: string;
    analyticsCropUrl: string;
    spatialBindingStatus: string;
    status: string;
    reviewedById: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    asset: { internalLabel: string; latitude: Decimalish; longitude: Decimalish } | null;
    ruleSet: {
      id: string;
      name: string;
      standardRef: string | null;
      standardVersion: string | null;
      triggerMetric: string;
      operator: string;
      thresholdValue: number;
      version: number;
    } | null;
    mediaAsset: {
      id: string;
      fullStoragePath: string;
      capturedAt: Date;
      ingestionSession: { id: string; modality: string; isNdaaVerified: boolean; boundHardwareId: string | null };
    };
  };
}

export interface ProvenanceChain {
  workOrder: {
    id: string;
    targetType: string;
    displayName: string;
    downstreamRef: string | null;
    idempotencyKey: string;
    isResolved: boolean;
    lastStatus: number | null;
    attempts: number;
    dispatchedAt: string;
  };
  source: {
    mediaAssetId: string;
    imagePath: string;
    ingestionSessionId: string;
    modality: string;
    ndaaVerified: boolean;
    boundHardwareId: string | null;
    visualCropUrl: string;
    analyticsCropUrl: string;
  };
  detection: {
    anomalyId: string;
    modelVersion: string | null;
    confidenceScore: number;
    metricDelta: number;
    metricUnit: string | null;
    boundingBox: number[];
    latitude: number | null;
    longitude: number | null;
    spatialBindingStatus: string;
    status: string;
  };
  asset: { internalLabel: string; latitude: number | null; longitude: number | null } | null;
  ruleHit: {
    ruleSetId: string;
    name: string;
    standardRef: string | null;
    standardVersion: string | null;
    triggerMetric: string;
    operator: string;
    thresholdValue: number;
    version: number;
    classification: string | null;
    recommendation: string | null;
  } | null;
  review: { reviewedById: string | null; reviewedAt: string | null };
  timestamps: {
    capturedAt: string | null;
    detectedAt: string | null;
    reviewedAt: string | null;
    dispatchedAt: string;
  };
}

/** PURE: flatten a dispatch + its chain into the reconstructable provenance record. */
export function toProvenance(row: ProvenanceRow): ProvenanceChain {
  const a = row.anomaly;
  const m = a.mediaAsset;
  return {
    workOrder: {
      id: row.id,
      targetType: row.integration.targetType,
      displayName: row.integration.displayName,
      downstreamRef: row.downstreamRef,
      idempotencyKey: row.idempotencyKey,
      isResolved: row.isResolved,
      lastStatus: row.lastStatus,
      attempts: row.attempts,
      dispatchedAt: row.createdAt.toISOString(),
    },
    source: {
      mediaAssetId: m.id,
      imagePath: m.fullStoragePath,
      ingestionSessionId: m.ingestionSession.id,
      modality: m.ingestionSession.modality,
      ndaaVerified: m.ingestionSession.isNdaaVerified,
      boundHardwareId: m.ingestionSession.boundHardwareId,
      visualCropUrl: a.visualCropUrl,
      analyticsCropUrl: a.analyticsCropUrl,
    },
    detection: {
      anomalyId: a.id,
      modelVersion: a.modelVersion,
      confidenceScore: a.confidenceScore,
      metricDelta: a.metricDelta,
      metricUnit: a.metricUnit,
      boundingBox: a.boundingBox,
      latitude: num(a.latitude),
      longitude: num(a.longitude),
      spatialBindingStatus: a.spatialBindingStatus,
      status: a.status,
    },
    asset: a.asset
      ? { internalLabel: a.asset.internalLabel, latitude: num(a.asset.latitude), longitude: num(a.asset.longitude) }
      : null,
    ruleHit: a.ruleSet
      ? {
          ruleSetId: a.ruleSet.id,
          name: a.ruleSet.name,
          standardRef: a.ruleSet.standardRef,
          standardVersion: a.ruleSet.standardVersion,
          triggerMetric: a.ruleSet.triggerMetric,
          operator: a.ruleSet.operator,
          thresholdValue: a.ruleSet.thresholdValue,
          version: a.ruleSet.version,
          classification: a.classification,
          recommendation: a.recommendation,
        }
      : null,
    review: { reviewedById: a.reviewedById, reviewedAt: iso(a.reviewedAt) },
    timestamps: {
      capturedAt: iso(m.capturedAt),
      detectedAt: iso(a.createdAt),
      reviewedAt: iso(a.reviewedAt),
      dispatchedAt: row.createdAt.toISOString(),
    },
  };
}

const CHAIN_SELECT = {
  id: true,
  downstreamRef: true,
  idempotencyKey: true,
  isResolved: true,
  lastStatus: true,
  attempts: true,
  createdAt: true,
  integration: { select: { targetType: true, displayName: true } },
  anomaly: {
    select: {
      id: true,
      confidenceScore: true,
      metricDelta: true,
      metricUnit: true,
      modelVersion: true,
      classification: true,
      standardRef: true,
      recommendation: true,
      boundingBox: true,
      latitude: true,
      longitude: true,
      visualCropUrl: true,
      analyticsCropUrl: true,
      spatialBindingStatus: true,
      status: true,
      reviewedById: true,
      reviewedAt: true,
      createdAt: true,
      asset: { select: { internalLabel: true, latitude: true, longitude: true } },
      ruleSet: {
        select: {
          id: true,
          name: true,
          standardRef: true,
          standardVersion: true,
          triggerMetric: true,
          operator: true,
          thresholdValue: true,
          version: true,
        },
      },
      mediaAsset: {
        select: {
          id: true,
          fullStoragePath: true,
          capturedAt: true,
          ingestionSession: { select: { id: true, modality: true, isNdaaVerified: true, boundHardwareId: true } },
        },
      },
    },
  },
} as const;

/**
 * Reconstruct the full provenance chain for a dispatched work order — ONE org-scoped query.
 * Returns null if the dispatch does not exist in the org (multi-tenant native, fail closed).
 */
export async function getProvenance(
  dispatchId: string,
  organizationId: string,
): Promise<ProvenanceChain | null> {
  const row = await prisma.workOrderDispatch.findFirst({
    where: { id: dispatchId, organizationId },
    select: CHAIN_SELECT,
  });
  return row ? toProvenance(row as ProvenanceRow) : null;
}
