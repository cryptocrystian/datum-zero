/**
 * M0-07 — tolerance evaluation + IEC TS 62446-3 classification (CR-12, CR-15).
 *
 * PURE functions only (no DB). Standards anchor the MEASUREMENT layer: a RuleSet's
 * triggerMetric/operator/thresholdValue decides whether a detection is in-tolerance, and on a match
 * the °C delta is mapped to an IEC TS 62446-3 thermal-abnormality category. The recommendation is
 * EVIDENCE-FRAMED ("review recommended vs. <standard>") — never a verdict (CR-12). The client
 * adjudicates the consequence.
 */

export interface RuleSpec {
  triggerMetric: string;
  operator: string; // ">=", ">", "<=", "<", "=="
  thresholdValue: number;
  standardRef: string | null;
  standardVersion: string | null;
}

export interface AnomalyMetrics {
  metricDelta: number;
  metricUnit: string | null;
  confidenceScore: number;
}

/** Resolve the value a rule triggers on. M0 solar-thermal: the temperature delta (°C). */
export function resolveTriggerValue(metrics: AnomalyMetrics, triggerMetric: string): number | null {
  if (/temp.*delta|delta/i.test(triggerMetric)) return metrics.metricDelta;
  return null; // unknown metric → cannot evaluate (extend as new modalities land)
}

export function evaluate(operator: string, value: number, threshold: number): boolean {
  switch (operator) {
    case ">=":
      return value >= threshold;
    case ">":
      return value > threshold;
    case "<=":
      return value <= threshold;
    case "<":
      return value < threshold;
    case "==":
      return value === threshold;
    default:
      return false;
  }
}

/**
 * Map a temperature delta to an IEC TS 62446-3 thermal-abnormality category (measurement layer).
 * Labels describe the severity of the thermal signature (observational) — never a verdict (CR-12).
 * Band boundaries are the platform's documented mapping over the standard's abnormality matrix.
 */
export function classifyDelta(metricDelta: number): string {
  const t = Math.abs(metricDelta);
  if (t >= 20) return "IEC TS 62446-3 Cat 3 — significant thermal abnormality";
  if (t >= 10) return "IEC TS 62446-3 Cat 2 — thermal abnormality";
  return "IEC TS 62446-3 Cat 1 — minor thermal signature";
}

/** Evidence-framed recommendation: measurement + "review recommended vs. <standard>". */
export function buildRecommendation(input: {
  metricDelta: number;
  confidenceScore: number;
  classification: string;
  standardRef: string | null;
  standardVersion: string | null;
}): string {
  const sign = input.metricDelta >= 0 ? "+" : "";
  const delta = `${sign}${input.metricDelta.toFixed(1)}°C delta vs. median`;
  const conf = `${(input.confidenceScore * 100).toFixed(1)}%`;
  const std =
    [input.standardRef, input.standardVersion].filter(Boolean).join(" ") || "the applicable standard";
  return `Measured ${delta} (confidence ${conf}); classified ${input.classification}. Review recommended vs. ${std}.`;
}

export interface ClassificationResult {
  matched: true;
  standardRef: string | null;
  classification: string;
  recommendation: string;
}

/** Evaluate metrics against a rule; on match, produce classification + evidence-framed recommendation. */
export function classify(metrics: AnomalyMetrics, rule: RuleSpec): ClassificationResult | null {
  const value = resolveTriggerValue(metrics, rule.triggerMetric);
  if (value == null) return null;
  if (!evaluate(rule.operator, value, rule.thresholdValue)) return null;

  const classification = classifyDelta(metrics.metricDelta);
  const recommendation = buildRecommendation({
    metricDelta: metrics.metricDelta,
    confidenceScore: metrics.confidenceScore,
    classification,
    standardRef: rule.standardRef,
    standardVersion: rule.standardVersion,
  });
  return { matched: true, standardRef: rule.standardRef, classification, recommendation };
}
