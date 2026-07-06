import { prisma, SpatialBindingStatus } from "@dz/db";
import { classify, type RuleSpec } from "./tolerance-eval";

/**
 * M0-07 — classification orchestration (CR-12, CR-15).
 *
 * Only BOUND anomalies are classified (fail closed on identity — an UNBOUND anomaly is never
 * classified and never dispatches). On a RuleSet match we set the measurement layer
 * (standardRef + classification) and an evidence-framed recommendation, and link the ruleSetId.
 * `status` stays PENDING_QA — classification NEVER advances the queue toward dispatch (CR-12).
 * Org-scoped and idempotent.
 */

export interface ClassifyOutcome {
  anomalyId: string;
  classified: boolean;
  ruleSetId?: string;
  classification?: string;
}

export async function classifyAnomaly(
  anomalyId: string,
  organizationId: string,
): Promise<ClassifyOutcome> {
  // Tenant-scoped, and only BOUND anomalies are eligible (fail closed).
  const anomaly = await prisma.anomaly.findFirst({
    where: { id: anomalyId, organizationId, spatialBindingStatus: SpatialBindingStatus.BOUND },
    select: {
      id: true,
      metricDelta: true,
      metricUnit: true,
      confidenceScore: true,
      classification: true,
      mediaAsset: { select: { ingestionSession: { select: { modality: true } } } },
    },
  });
  if (!anomaly) return { anomalyId, classified: false }; // unbound / not in org → not eligible
  if (anomaly.classification) return { anomalyId, classified: false }; // idempotent — already classified

  const modality = anomaly.mediaAsset.ingestionSession.modality;
  const rules = await prisma.ruleSet.findMany({
    where: { organizationId, targetModality: modality },
    orderBy: { version: "desc" },
    select: {
      id: true,
      triggerMetric: true,
      operator: true,
      thresholdValue: true,
      standardRef: true,
      standardVersion: true,
    },
  });

  for (const rule of rules) {
    const spec: RuleSpec = {
      triggerMetric: rule.triggerMetric,
      operator: rule.operator,
      thresholdValue: rule.thresholdValue,
      standardRef: rule.standardRef,
      standardVersion: rule.standardVersion,
    };
    const result = classify(
      {
        metricDelta: anomaly.metricDelta,
        metricUnit: anomaly.metricUnit,
        confidenceScore: anomaly.confidenceScore,
      },
      spec,
    );
    if (result) {
      await prisma.anomaly.update({
        where: { id: anomaly.id },
        data: {
          standardRef: result.standardRef,
          classification: result.classification,
          recommendation: result.recommendation,
          ruleSetId: rule.id,
          // status is intentionally NOT touched — it stays PENDING_QA (CR-12).
        },
      });
      return { anomalyId, classified: true, ruleSetId: rule.id, classification: result.classification };
    }
  }
  return { anomalyId, classified: false };
}

export interface ClassifySummary {
  organizationId: string;
  considered: number;
  classified: number;
  results: ClassifyOutcome[];
}

/** Classify every BOUND, not-yet-classified anomaly for one org. Unbound anomalies are skipped. */
export async function classifyBoundAnomalies(organizationId: string): Promise<ClassifySummary> {
  const bound = await prisma.anomaly.findMany({
    where: {
      organizationId,
      spatialBindingStatus: SpatialBindingStatus.BOUND,
      classification: null,
    },
    select: { id: true },
  });

  const results: ClassifyOutcome[] = [];
  let classified = 0;
  for (const { id } of bound) {
    const outcome = await classifyAnomaly(id, organizationId);
    if (outcome.classified) classified += 1;
    results.push(outcome);
  }
  return { organizationId, considered: bound.length, classified, results };
}
