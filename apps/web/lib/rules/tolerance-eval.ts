/**
 * M0-07 (reframed DET-1c) — RuleSet as CLIENT POLICY over the model classification (CR-12, CR-15 amend).
 *
 * PURE functions only (no DB). The MODEL (CR-19) owns the anomaly TYPE — the learned classifier
 * assigns the IEC TS 62446-3 category and it is persisted at the inference callback. The RuleSet no
 * longer derives the type from a ΔT cutoff; it is the client's configurable POLICY that consumes the
 * model classification + ΔT + confidence and produces routing/priority/recommendation:
 *   • priority  — combine the model category with ΔT (a high ΔT ESCALATES toward PROMPT), banded by
 *                 the client's own thresholdValue (the escalation knob), per the DET-1b posture;
 *   • routeTargets — the client's delivery routing for this finding;
 *   • recommendation — EVIDENCE-FRAMED ("review recommended vs. <standard>"), never a verdict (CR-12).
 * The client adjudicates the consequence; a human QA gate approves every dispatch (CR-12).
 */

export type Priority = "MONITOR" | "SCHEDULED" | "PROMPT";

const PRIORITY_BY_CATEGORY: Record<1 | 2 | 3, Priority> = {
  1: "MONITOR",
  2: "SCHEDULED",
  3: "PROMPT",
};

export interface PolicySpec {
  triggerMetric: string;
  operator: string; // ">=", ">", "<=", "<", "=="
  thresholdValue: number; // client escalation knob (°C): the SCHEDULED floor; 2× is the PROMPT floor
  routeTargets: string[];
  standardRef: string | null;
  standardVersion: string | null;
}

export interface ModelFinding {
  classification: string | null; // model type, e.g. "IEC TS 62446-3 Cat 2 — Cell: ..."
  metricDelta: number;
  metricUnit: string | null;
  confidenceScore: number;
  standardRef: string | null;
}

/** Resolve the value a rule triggers on. M0 solar-thermal: the temperature delta (°C). */
export function resolveTriggerValue(metricDelta: number, metricUnit: string | null, triggerMetric: string): number | null {
  if (/temp.*delta|delta/i.test(triggerMetric)) return metricDelta;
  return null; // unknown metric → cannot evaluate ΔT escalation (extend as new modalities land)
}

export function evaluate(operator: string, value: number, threshold: number): boolean {
  switch (operator) {
    case ">=": return value >= threshold;
    case ">": return value > threshold;
    case "<=": return value <= threshold;
    case "<": return value < threshold;
    case "==": return value === threshold;
    default: return false;
  }
}

/** Base IEC category the MODEL assigned, read from its classification string ("… Cat N …"). */
export function modelCategory(classification: string | null): 1 | 2 | 3 | null {
  const m = /cat\s*([123])/i.exec(classification ?? "");
  return m ? (Number(m[1]) as 1 | 2 | 3) : null;
}

/** ΔT → escalation category, banded by the CLIENT's thresholdValue (SCHEDULED floor; 2× = PROMPT). */
export function deltaCategory(metricDelta: number, thresholdValue: number): 1 | 2 | 3 {
  const t = Math.abs(metricDelta);
  if (thresholdValue > 0 && t >= thresholdValue * 2) return 3;
  if (thresholdValue > 0 && t >= thresholdValue) return 2;
  return 1;
}

/** Evidence-framed recommendation: measurement + priority + "review recommended vs. <standard>". */
export function buildRecommendation(input: {
  classification: string | null;
  metricDelta: number;
  confidenceScore: number;
  priority: Priority;
  standardRef: string | null;
  standardVersion: string | null;
}): string {
  const sign = input.metricDelta >= 0 ? "+" : "";
  const delta = `${sign}${input.metricDelta.toFixed(1)}°C delta vs. median`;
  const conf = `${(input.confidenceScore * 100).toFixed(1)}%`;
  const cls = input.classification ?? "thermal finding";
  const std =
    [input.standardRef, input.standardVersion].filter(Boolean).join(" ") || "the applicable standard";
  return `Measured ${delta} (confidence ${conf}); model classified ${cls}. Priority ${input.priority}. Review recommended vs. ${std}.`;
}

export interface PolicyResult {
  priority: Priority;
  category: 1 | 2 | 3;
  routeTargets: string[];
  recommendation: string;
}

/**
 * Apply the client RuleSet POLICY to a model finding. Combines the model's category with the ΔT
 * escalation (bounded by the client's thresholdValue) → served priority; carries routeTargets +
 * an evidence-framed recommendation. The ΔT only ESCALATES — it never downgrades the model's type.
 */
export function applyPolicy(finding: ModelFinding, rule: PolicySpec): PolicyResult {
  const base = modelCategory(finding.classification) ?? 1;

  // ΔT escalation only when the client's trigger metric is resolvable AND its operator fires.
  const triggerValue = resolveTriggerValue(finding.metricDelta, finding.metricUnit, rule.triggerMetric);
  const fires = triggerValue != null && evaluate(rule.operator, triggerValue, rule.thresholdValue);
  const escalation = fires ? deltaCategory(finding.metricDelta, rule.thresholdValue) : 1;

  const category = Math.max(base, escalation) as 1 | 2 | 3;
  const priority = PRIORITY_BY_CATEGORY[category];
  const recommendation = buildRecommendation({
    classification: finding.classification,
    metricDelta: finding.metricDelta,
    confidenceScore: finding.confidenceScore,
    priority,
    standardRef: finding.standardRef ?? rule.standardRef,
    standardVersion: rule.standardVersion,
  });
  return { priority, category, routeTargets: rule.routeTargets, recommendation };
}
