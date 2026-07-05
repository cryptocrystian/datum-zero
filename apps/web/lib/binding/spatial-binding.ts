import { prisma, SpatialBindingStatus } from "@dz/db";

/**
 * M0-06 — spatial auto-binding (CR-13, CR-16).
 *
 * Resolve an UNBOUND_REVIEW anomaly to the nearest registry Asset WITHIN THE SAME ORG by geospatial
 * nearest-neighbor on lat/long. FAIL CLOSED on identity: if the nearest asset is beyond the bind
 * radius, or the two nearest are near-equidistant (ambiguous), we DO NOT guess — the anomaly stays
 * UNBOUND_REVIEW for human binding, and an unbound anomaly never dispatches.
 */

// A detection must sit within half the seeded ~10 m array pitch of an asset to bind; if the two
// nearest assets are near-equidistant we refuse to guess. Both are fail-closed knobs.
export const MAX_BIND_DISTANCE_METERS = 5.0;
export const AMBIGUITY_MARGIN_METERS = 2.0;

export interface GeoAsset {
  id: string;
  internalLabel: string;
  latitude: number;
  longitude: number;
}

export type BindReason = "NO_COORDS" | "NO_ASSETS" | "NO_MATCH_IN_RANGE" | "AMBIGUOUS";

export type BindDecision =
  | { status: "BOUND"; assetId: string; internalLabel: string; distanceMeters: number }
  | { status: "UNBOUND_REVIEW"; reason: BindReason; nearestDistanceMeters?: number };

/** Great-circle distance in metres. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius (m)
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Pure nearest-neighbor resolution with fail-closed guards — NEVER guesses.
 * BOUND only when a single asset is unambiguously closest and within range.
 */
export function resolveNearestAsset(
  assets: GeoAsset[],
  latitude: number | null,
  longitude: number | null,
): BindDecision {
  if (latitude == null || longitude == null) {
    return { status: "UNBOUND_REVIEW", reason: "NO_COORDS" };
  }
  const ranked = assets
    .map((a) => ({ a, d: haversineMeters(latitude, longitude, a.latitude, a.longitude) }))
    .sort((x, y) => x.d - y.d);

  if (ranked.length === 0) {
    return { status: "UNBOUND_REVIEW", reason: "NO_ASSETS" };
  }
  const nearest = ranked[0];
  if (nearest.d > MAX_BIND_DISTANCE_METERS) {
    return { status: "UNBOUND_REVIEW", reason: "NO_MATCH_IN_RANGE", nearestDistanceMeters: nearest.d };
  }
  const second = ranked[1];
  if (second && second.d - nearest.d < AMBIGUITY_MARGIN_METERS) {
    return { status: "UNBOUND_REVIEW", reason: "AMBIGUOUS", nearestDistanceMeters: nearest.d };
  }
  return {
    status: "BOUND",
    assetId: nearest.a.id,
    internalLabel: nearest.a.internalLabel,
    distanceMeters: nearest.d,
  };
}

function toNum(x: unknown): number | null {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Bind a single anomaly. Org-scoped read; leaves the row UNBOUND unless the match is confident.
 * Idempotent — an already-BOUND anomaly is a no-op.
 */
export async function bindAnomaly(
  anomalyId: string,
  organizationId: string,
): Promise<BindDecision> {
  // Tenant-scoped (multi-tenant native): the anomaly must belong to this org.
  const anomaly = await prisma.anomaly.findFirst({
    where: { id: anomalyId, organizationId },
    select: { id: true, latitude: true, longitude: true, spatialBindingStatus: true, assetId: true },
  });
  if (!anomaly) throw new Error(`anomaly not found in org: ${anomalyId}`);

  if (anomaly.spatialBindingStatus === SpatialBindingStatus.BOUND && anomaly.assetId) {
    return { status: "BOUND", assetId: anomaly.assetId, internalLabel: "", distanceMeters: 0 };
  }

  // Strictly org-scoped registry lookup — only this org's assets are candidates.
  const assets = await prisma.asset.findMany({
    where: { organizationId, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, internalLabel: true, latitude: true, longitude: true },
  });
  const geo: GeoAsset[] = assets
    .map((a) => ({
      id: a.id,
      internalLabel: a.internalLabel,
      latitude: toNum(a.latitude),
      longitude: toNum(a.longitude),
    }))
    .filter((a): a is GeoAsset => a.latitude != null && a.longitude != null);

  const decision = resolveNearestAsset(geo, toNum(anomaly.latitude), toNum(anomaly.longitude));

  if (decision.status === "BOUND") {
    await prisma.anomaly.update({
      where: { id: anomaly.id },
      data: { assetId: decision.assetId, spatialBindingStatus: SpatialBindingStatus.BOUND },
    });
  }
  // Otherwise leave UNBOUND_REVIEW for human binding — never guess, never dispatch unbound.
  return decision;
}

export interface BindSummary {
  organizationId: string;
  total: number;
  bound: number;
  unbound: number;
  results: Array<{ anomalyId: string; decision: BindDecision }>;
}

/** Bind every UNBOUND_REVIEW anomaly for one org (the auto-binding pass, M0-06). */
export async function bindUnboundAnomalies(organizationId: string): Promise<BindSummary> {
  const pending = await prisma.anomaly.findMany({
    where: { organizationId, spatialBindingStatus: SpatialBindingStatus.UNBOUND_REVIEW },
    select: { id: true },
  });

  const results: BindSummary["results"] = [];
  let bound = 0;
  for (const { id } of pending) {
    const decision = await bindAnomaly(id, organizationId);
    if (decision.status === "BOUND") bound += 1;
    results.push({ anomalyId: id, decision });
  }
  return { organizationId, total: pending.length, bound, unbound: pending.length - bound, results };
}
