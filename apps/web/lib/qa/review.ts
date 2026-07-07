import { prisma, QueueStatus, SpatialBindingStatus } from "@dz/db";
import { applyClientPolicy } from "../rules/classify";
import { dispatchAnomaly } from "../outbox/dispatch";

/**
 * M0-08 — QA review service (CR-12). Every query is organizationId-scoped (multi-tenant native).
 * The cockpit is a MANUAL human gate: it surfaces measurements + recommendations; a reviewer
 * approves or rejects. Nothing here dispatches — that is the guarded outbox (M0-09).
 */

export interface QueueItemDTO {
  id: string;
  status: string;
  spatialBindingStatus: string;
  boundingBox: number[];
  latitude: number | null;
  longitude: number | null;
  confidenceScore: number;
  metricDelta: number;
  metricUnit: string | null;
  classification: string | null;
  priority: string | null;
  recommendation: string | null;
  standardRef: string | null;
  modelVersion: string | null;
  visualCropUrl: string;
  analyticsCropUrl: string;
  assetId: string | null;
  internalLabel: string | null;
  modality: string;
  createdAt: string;
}

export interface AssetDTO {
  id: string;
  internalLabel: string;
  latitude: number | null;
  longitude: number | null;
}

export interface IntegrationDTO {
  id: string;
  targetType: string;
  displayName: string;
}

const num = (x: unknown): number | null => (x == null ? null : Number(x));

/** The review queue: everything still awaiting a human decision (PENDING_QA), bound or unbound. */
export async function listReviewQueue(organizationId: string): Promise<QueueItemDTO[]> {
  const rows = await prisma.anomaly.findMany({
    where: { organizationId, status: QueueStatus.PENDING_QA },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      spatialBindingStatus: true,
      boundingBox: true,
      latitude: true,
      longitude: true,
      confidenceScore: true,
      metricDelta: true,
      metricUnit: true,
      classification: true,
      priority: true,
      recommendation: true,
      standardRef: true,
      modelVersion: true,
      visualCropUrl: true,
      analyticsCropUrl: true,
      assetId: true,
      asset: { select: { internalLabel: true } },
      mediaAsset: { select: { ingestionSession: { select: { modality: true } } } },
      createdAt: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    spatialBindingStatus: r.spatialBindingStatus,
    boundingBox: r.boundingBox,
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    confidenceScore: r.confidenceScore,
    metricDelta: r.metricDelta,
    metricUnit: r.metricUnit,
    classification: r.classification,
    priority: r.priority,
    recommendation: r.recommendation,
    standardRef: r.standardRef,
    modelVersion: r.modelVersion,
    visualCropUrl: r.visualCropUrl,
    analyticsCropUrl: r.analyticsCropUrl,
    assetId: r.assetId,
    internalLabel: r.asset?.internalLabel ?? null,
    modality: r.mediaAsset.ingestionSession.modality,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listOrgAssets(organizationId: string): Promise<AssetDTO[]> {
  const rows = await prisma.asset.findMany({
    where: { organizationId },
    orderBy: { internalLabel: "asc" },
    select: { id: true, internalLabel: true, latitude: true, longitude: true },
  });
  return rows.map((a) => ({ id: a.id, internalLabel: a.internalLabel, latitude: num(a.latitude), longitude: num(a.longitude) }));
}

/** Distinct physical sites (SITE_ID, the internalLabel prefix — CR-17) for the command-bar selector. */
export async function listOrgSites(organizationId: string): Promise<string[]> {
  const rows = await prisma.asset.findMany({
    where: { organizationId },
    select: { internalLabel: true },
  });
  const sites = new Set<string>();
  for (const r of rows) {
    const siteId = r.internalLabel.split("-")[0];
    if (siteId) sites.add(siteId);
  }
  return [...sites].sort();
}

export async function listOrgIntegrations(organizationId: string): Promise<IntegrationDTO[]> {
  const rows = await prisma.integration.findMany({
    where: { organizationId, isActive: true },
    orderBy: { displayName: "asc" },
    select: { id: true, targetType: true, displayName: true },
  });
  return rows.map((i) => ({ id: i.id, targetType: i.targetType, displayName: i.displayName }));
}

/** Approve → APPROVED_DISPATCHED + reviewer stamps. Only a BOUND, PENDING_QA anomaly is eligible. */
export async function approveAnomaly(anomalyId: string, organizationId: string, reviewerId: string): Promise<void> {
  const anomaly = await prisma.anomaly.findFirst({
    where: { id: anomalyId, organizationId },
    select: { status: true, spatialBindingStatus: true },
  });
  if (!anomaly) throw new Error("anomaly not found in org");
  if (anomaly.status !== QueueStatus.PENDING_QA) throw new Error("anomaly is not awaiting QA");
  if (anomaly.spatialBindingStatus !== SpatialBindingStatus.BOUND) {
    throw new Error("cannot approve an unbound anomaly — bind it to an asset first (CR-13)");
  }
  await prisma.anomaly.update({
    where: { id: anomalyId },
    data: { status: QueueStatus.APPROVED_DISPATCHED, reviewedById: reviewerId, reviewedAt: new Date() },
  });
  // Dispatch ONLY through the guarded entry point — the 100% QA gate re-runs there (CR-12).
  await dispatchAnomaly(anomalyId, organizationId);
}

/** Reject → REJECTED_FALSE_POSITIVE + reviewer stamps (audit trail, CR-12). */
export async function rejectAnomaly(anomalyId: string, organizationId: string, reviewerId: string): Promise<void> {
  const anomaly = await prisma.anomaly.findFirst({
    where: { id: anomalyId, organizationId },
    select: { status: true },
  });
  if (!anomaly) throw new Error("anomaly not found in org");
  if (anomaly.status !== QueueStatus.PENDING_QA) throw new Error("anomaly is not awaiting QA");
  await prisma.anomaly.update({
    where: { id: anomalyId },
    data: { status: QueueStatus.REJECTED_FALSE_POSITIVE, reviewedById: reviewerId, reviewedAt: new Date() },
  });
}

/** Manual binding for an UNBOUND_REVIEW item: attach an org asset, flip to BOUND, then classify. */
export async function bindAnomalyToAsset(anomalyId: string, organizationId: string, assetId: string): Promise<void> {
  const anomaly = await prisma.anomaly.findFirst({
    where: { id: anomalyId, organizationId },
    select: { spatialBindingStatus: true },
  });
  if (!anomaly) throw new Error("anomaly not found in org");
  // Asset must belong to the same tenant.
  const asset = await prisma.asset.findFirst({ where: { id: assetId, organizationId }, select: { id: true } });
  if (!asset) throw new Error("asset not found in org");

  await prisma.anomaly.update({
    where: { id: anomalyId },
    data: { assetId, spatialBindingStatus: SpatialBindingStatus.BOUND },
  });
  // Now that it is bound, apply the client RuleSet POLICY (DET-1c). status stays PENDING_QA.
  await applyClientPolicy(anomalyId, organizationId);
}
