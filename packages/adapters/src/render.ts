import type { RenderContext } from "./types";
import type { ActionPriority, UnifiedAnomalyPayload } from "./unified-envelope";

/**
 * Render the canonical, evidence-framed work order (CR-12, CR-15). MEASUREMENT + RECOMMENDATION
 * only — never a verdict. Wire format is snake_case (MANIFEST §3).
 *
 * The AUTHORITATIVE renderer is `renderWorkOrderFromEnvelope`: it maps the single internal
 * `UnifiedAnomalyPayload` (M2-PREP, CR-21) into `contracts/work-order.schema.json` via the §3.1
 * mapping in docs/INTEGRATION-ADAPTER-ROADMAP.md. Native adapters render the SAME envelope into their
 * own schema. `renderWorkOrder(ctx)` is the dispatch-time assembler that builds the envelope from an
 * approved, BOUND anomaly and delegates — one renderer, one output contract, one internal object.
 */

/** Generic evidence recommendation for a bound-but-unclassified anomaly — never null, never verdict. */
export function fallbackRecommendation(metricDelta: number, confidenceScore: number): string {
  const sign = metricDelta >= 0 ? "+" : "";
  return `Measured ${sign}${metricDelta.toFixed(1)}°C delta vs. median at ${(confidenceScore * 100).toFixed(1)}% confidence; review recommended.`;
}

// §3.1: findingData.priority → recommendation.priority_hint.
const PRIORITY_HINT: Record<ActionPriority, "LOW" | "MEDIUM" | "HIGH"> = {
  MONITOR: "LOW",
  SCHEDULED: "MEDIUM",
  PROMPT: "HIGH",
};

/**
 * THE generic-adapter renderer: `UnifiedAnomalyPayload` → `work-order.schema.json` (§3.1 mapping).
 * `targetHints` is deliberately ignored here — it is read only by native adapters.
 */
export function renderWorkOrderFromEnvelope(p: UnifiedAnomalyPayload): Record<string, unknown> {
  // asset.external_ids: flatten externalSystemMappings + nest procoreLocationId (§3.1).
  const externalIds: Record<string, string | number> = {};
  for (const m of p.assetContext.externalSystemMappings ?? []) externalIds[m.targetPlatform] = m.externalId;
  if (p.assetContext.procoreLocationId != null) externalIds.procore_location_id = p.assetContext.procoreLocationId;

  const asset: Record<string, unknown> = {
    internal_label: p.assetContext.internalLabel,
    latitude: p.spatialReference.latitude,
    longitude: p.spatialReference.longitude,
  };
  if (Object.keys(externalIds).length > 0) asset.external_ids = externalIds;

  const audit: Record<string, unknown> = {
    captured_at: p.auditProvenance.capturedAt,
    model_version: p.auditProvenance.modelVersion,
    reviewed_by: p.auditProvenance.reviewedById,
    reviewed_at: p.auditProvenance.reviewedAt,
    ingestion_session_id: p.auditProvenance.ingestionSessionId ?? null,
  };
  if (p.auditProvenance.ndaaVerified !== undefined) audit.ndaa_verified = p.auditProvenance.ndaaVerified;

  return {
    schema_version: "1.0",
    work_order_id: p.systemHeaders.datumZeroId,
    idempotency_key: p.systemHeaders.idempotencyKey,
    organization_id: p.systemHeaders.organizationId,
    emitted_at: p.systemHeaders.timestamp,
    asset,
    finding: {
      modality: p.findingData.modality,
      standard_ref: p.findingData.standardRef ?? null,
      classification: p.findingData.classification ?? null,
      metric_delta: p.findingData.metricDeltaValue,
      metric_unit: p.findingData.metricUnit,
      confidence_score: p.findingData.confidenceScore, // envelope already 0..100
      bounding_box: p.findingData.boundingBox ?? null,
      visual_crop_url: p.findingData.visualCropUrl,
      analytics_crop_url: p.findingData.analyticsCropUrl,
    },
    recommendation: {
      text: p.findingData.evidenceSummary,
      recommended_action: p.findingData.recommendedAction,
      priority_hint: PRIORITY_HINT[p.findingData.priority],
    },
    audit,
  };
}

/** Assemble the internal envelope from an approved, BOUND anomaly context (dispatch-time input). */
export function contextToEnvelope(ctx: RenderContext): UnifiedAnomalyPayload {
  const a = ctx.anomaly;

  // ctx.asset.externalIds (object) → envelope: procore_location_id gets its dedicated slot; every
  // other external id rides in externalSystemMappings keyed by platform. Round-trips 1:1 (§3.1).
  const mappings: { targetPlatform: string; externalId: string }[] = [];
  let procoreLocationId: number | undefined;
  for (const [k, v] of Object.entries(ctx.asset.externalIds ?? {})) {
    if (k === "procore_location_id") procoreLocationId = Number(v);
    else mappings.push({ targetPlatform: k, externalId: String(v) });
  }

  const d = a.metricDelta;
  const priority: ActionPriority = Math.abs(d) >= 20 ? "PROMPT" : Math.abs(d) >= 10 ? "SCHEDULED" : "MONITOR";

  return {
    systemHeaders: {
      datumZeroId: ctx.dispatchId,
      organizationId: ctx.organizationId,
      idempotencyKey: ctx.idempotencyKey,
      timestamp: ctx.emittedAt,
    },
    assetContext: {
      internalLabel: ctx.asset.internalLabel,
      ...(procoreLocationId !== undefined ? { procoreLocationId } : {}),
      ...(mappings.length > 0 ? { externalSystemMappings: mappings } : {}),
    },
    spatialReference: {
      // Registry asset coords, forwarded as-is (nullable). The output contract permits null, so a
      // coordless asset emits null rather than a fabricated 0,0.
      latitude: ctx.asset.latitude,
      longitude: ctx.asset.longitude,
    },
    findingData: {
      modality: ctx.capture.modality as UnifiedAnomalyPayload["findingData"]["modality"],
      standardRef: a.standardRef,
      classification: a.classification,
      confidenceScore: Math.round(a.confidenceScore * 1000) / 10, // 0..1 → 0..100 (1dp)
      metricDeltaValue: a.metricDelta,
      metricUnit: (a.metricUnit as UnifiedAnomalyPayload["findingData"]["metricUnit"]) ?? "CELSIUS_DELTA",
      boundingBox: a.boundingBox.length === 4 ? (a.boundingBox as [number, number, number, number]) : null,
      priority,
      recommendedAction: "REVIEW",
      evidenceSummary: a.recommendation ?? fallbackRecommendation(a.metricDelta, a.confidenceScore),
      visualCropUrl: a.visualCropUrl,
      analyticsCropUrl: a.analyticsCropUrl,
    },
    auditProvenance: {
      capturedAt: ctx.capture.capturedAt,
      modelVersion: a.modelVersion ?? "unknown",
      reviewedById: a.reviewedById,
      reviewedAt: a.reviewedAt,
      ingestionSessionId: ctx.capture.ingestionSessionId,
      ndaaVerified: ctx.capture.ndaaVerified,
    },
  };
}

/** Dispatch-time render: assemble the canonical envelope, then render the output contract from it. */
export function renderWorkOrder(ctx: RenderContext): Record<string, unknown> {
  return renderWorkOrderFromEnvelope(contextToEnvelope(ctx));
}
