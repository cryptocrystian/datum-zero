import { prisma, SpatialBindingStatus } from "@dz/db";
import { applyPolicy, type PolicySpec, type CategoryPriorityMap } from "./tolerance-eval";

/**
 * M0-07 (reframed DET-1c) — client-policy application (CR-12, CR-15 amend).
 *
 * The MODEL owns the anomaly TYPE (classification + standardRef), persisted at the inference callback
 * (CR-19). This step applies the client's RuleSet POLICY to a BOUND anomaly: it consumes the model
 * classification + ΔT + confidence and sets the maintenance `priority`, an evidence-framed
 * `recommendation`, and links the `ruleSetId` (whose `routeTargets` drive dispatch routing). It does
 * NOT write classification/standardRef — those are the model's authority and already persisted.
 *
 * Only BOUND anomalies get policy (fail closed on identity — routing needs an asset). `status` stays
 * PENDING_QA: policy NEVER advances the queue toward dispatch (CR-12). Org-scoped and idempotent.
 */

export interface PolicyOutcome {
  anomalyId: string;
  applied: boolean;
  ruleSetId?: string;
  priority?: string;
}

export async function applyClientPolicy(
  anomalyId: string,
  organizationId: string,
): Promise<PolicyOutcome> {
  // Tenant-scoped, BOUND-only (fail closed).
  const anomaly = await prisma.anomaly.findFirst({
    where: { id: anomalyId, organizationId, spatialBindingStatus: SpatialBindingStatus.BOUND },
    select: {
      id: true,
      classification: true,
      standardRef: true,
      metricDelta: true,
      metricUnit: true,
      confidenceScore: true,
      iecCategory: true,
      ruleSetId: true,
      mediaAsset: { select: { ingestionSession: { select: { modality: true } } } },
    },
  });
  if (!anomaly) return { anomalyId, applied: false }; // unbound / not in org → not eligible
  if (anomaly.ruleSetId) return { anomalyId, applied: false }; // idempotent — policy already applied

  const modality = anomaly.mediaAsset.ingestionSession.modality;
  // The client's active policy for this modality (highest version wins; overrides fork the template).
  const rule = await prisma.ruleSet.findFirst({
    where: { organizationId, targetModality: modality },
    orderBy: { version: "desc" },
    select: {
      id: true,
      categoryPriority: true,
      triggerMetric: true,
      operator: true,
      thresholdValue: true,
      routeTargets: true,
      standardRef: true,
      standardVersion: true,
    },
  });
  if (!rule) return { anomalyId, applied: false }; // no client policy → delivery uses the generic fallback

  const spec: PolicySpec = {
    categoryPriority: (rule.categoryPriority ?? {}) as CategoryPriorityMap,
    routeTargets: rule.routeTargets,
    standardRef: rule.standardRef,
    standardVersion: rule.standardVersion,
  };
  const result = applyPolicy(
    {
      iecCategory: anomaly.iecCategory as 1 | 2 | 3 | null,
      classification: anomaly.classification,
      metricDelta: anomaly.metricDelta,
      confidenceScore: anomaly.confidenceScore,
      standardRef: anomaly.standardRef,
    },
    spec,
  );

  // CR-30: priority derives from the OBJECTIVE iecCategory via the client's category→priority map.
  // iecCategory = null (No-Anomaly / non-category) -> no dispatchable priority; mark the policy
  // considered (ruleSetId) so it isn't reprocessed. classification/standardRef stay the MODEL's
  // authority; status stays PENDING_QA (CR-12).
  await prisma.anomaly.update({
    where: { id: anomaly.id },
    data: result
      ? { priority: result.priority, recommendation: result.recommendation, ruleSetId: rule.id }
      : { ruleSetId: rule.id },
  });
  return { anomalyId, applied: true, ruleSetId: rule.id, priority: result?.priority };
}

export interface PolicySummary {
  organizationId: string;
  considered: number;
  applied: number;
  results: PolicyOutcome[];
}

/** Apply client policy to every BOUND, not-yet-policied anomaly for one org. Unbound are skipped. */
export async function applyPolicyToBoundAnomalies(organizationId: string): Promise<PolicySummary> {
  const bound = await prisma.anomaly.findMany({
    where: {
      organizationId,
      spatialBindingStatus: SpatialBindingStatus.BOUND,
      ruleSetId: null,
    },
    select: { id: true },
  });

  const results: PolicyOutcome[] = [];
  let applied = 0;
  for (const { id } of bound) {
    const outcome = await applyClientPolicy(id, organizationId);
    if (outcome.applied) applied += 1;
    results.push(outcome);
  }
  return { organizationId, considered: bound.length, applied, results };
}
