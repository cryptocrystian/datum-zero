import type { RenderContext } from "./types";

/**
 * Render the canonical, evidence-framed work order (CR-12, CR-15). MEASUREMENT + RECOMMENDATION
 * only — never a verdict. Wire format is snake_case (MANIFEST §3).
 */

/** Generic evidence recommendation for a bound-but-unclassified anomaly — never null, never verdict. */
export function fallbackRecommendation(metricDelta: number, confidenceScore: number): string {
  const sign = metricDelta >= 0 ? "+" : "";
  return `Measured ${sign}${metricDelta.toFixed(1)}°C delta vs. median at ${(confidenceScore * 100).toFixed(1)}% confidence; review recommended.`;
}

function priorityHint(metricDelta: number): "LOW" | "MEDIUM" | "HIGH" {
  const t = Math.abs(metricDelta);
  if (t >= 20) return "HIGH";
  if (t >= 10) return "MEDIUM";
  return "LOW";
}

export function renderWorkOrder(ctx: RenderContext): Record<string, unknown> {
  const a = ctx.anomaly;
  // If no rule classified the anomaly (M0-07 found no match), emit a generic evidence recommendation.
  const text = a.recommendation ?? fallbackRecommendation(a.metricDelta, a.confidenceScore);

  const asset: Record<string, unknown> = {
    internal_label: ctx.asset.internalLabel,
    latitude: ctx.asset.latitude,
    longitude: ctx.asset.longitude,
  };
  if (ctx.asset.externalIds && Object.keys(ctx.asset.externalIds).length > 0) {
    asset.external_ids = ctx.asset.externalIds;
  }

  return {
    schema_version: "1.0",
    work_order_id: ctx.dispatchId,
    idempotency_key: ctx.idempotencyKey,
    organization_id: ctx.organizationId,
    emitted_at: ctx.emittedAt,
    asset,
    finding: {
      modality: ctx.capture.modality,
      standard_ref: a.standardRef,
      classification: a.classification,
      metric_delta: a.metricDelta,
      metric_unit: a.metricUnit,
      confidence_score: Math.round(a.confidenceScore * 1000) / 10, // 0..1 → 0..100 (1dp)
      bounding_box: a.boundingBox.length === 4 ? a.boundingBox : null,
      visual_crop_url: a.visualCropUrl,
      analytics_crop_url: a.analyticsCropUrl,
    },
    recommendation: {
      text,
      recommended_action: "REVIEW",
      priority_hint: priorityHint(a.metricDelta),
    },
    audit: {
      captured_at: ctx.capture.capturedAt,
      model_version: a.modelVersion ?? "unknown",
      reviewed_by: a.reviewedById,
      reviewed_at: a.reviewedAt,
      ingestion_session_id: ctx.capture.ingestionSessionId,
      ndaa_verified: ctx.capture.ndaaVerified,
    },
  };
}
