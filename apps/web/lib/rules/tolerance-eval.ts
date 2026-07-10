/**
 * M2-2c (CR-30 — CR-15 completion) — RuleSet as CLIENT POLICY: priority is a pure function of the
 * OBJECTIVE IEC Category, mapped per client policy. No ΔT fusion.
 *
 * The MODEL (CR-19) owns the anomaly TYPE; `iec_mapping` (M2-2a, CR-28) owns the OBJECTIVE Category
 * (the standard's ΔT ranges are already encoded INTO the category); the RuleSet owns PRIORITY — a
 * client-configurable category→priority map. PURE (no DB). Evidence-framed recommendation, never a
 * verdict (CR-12); the 100% human QA gate approves every dispatch.
 */

export type Priority = "MONITOR" | "SCHEDULED" | "PROMPT";
export type IecCategory = 1 | 2 | 3;
export type CategoryPriorityMap = Partial<Record<"1" | "2" | "3", Priority>>;

/** Standards-anchored default (seed): objective IEC category → maintenance priority. Client-overridable. */
export const DEFAULT_CATEGORY_PRIORITY: Record<"1" | "2" | "3", Priority> = {
  "1": "MONITOR",
  "2": "SCHEDULED",
  "3": "PROMPT",
};

export interface PolicySpec {
  /** Client policy; a missing key falls back to the standards default. */
  categoryPriority: CategoryPriorityMap;
  routeTargets: string[];
  standardRef: string | null;
  standardVersion: string | null;
}

export interface ModelFinding {
  /** OBJECTIVE grounded category (M2-2a). null = No-Anomaly / non-category → no dispatchable priority. */
  iecCategory: IecCategory | null;
  classification: string | null;
  metricDelta: number;
  confidenceScore: number;
  standardRef: string | null;
}

export interface PolicyResult {
  priority: Priority;
  category: IecCategory;
  routeTargets: string[];
  recommendation: string;
}

/** Priority for an IEC category under client policy: the org's map, else the standards default. Pure. */
export function priorityForCategory(category: IecCategory, map: CategoryPriorityMap): Priority {
  const key = String(category) as "1" | "2" | "3";
  return map[key] ?? DEFAULT_CATEGORY_PRIORITY[key];
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

/**
 * Apply the client RuleSet POLICY to a model finding. Priority derives PURELY from the objective IEC
 * category via the client's category→priority map (CR-30) — NOT from raw ΔT (the standard's ΔT ranges
 * are already inside the category, M2-2a). Returns null when the finding has NO objective category
 * (No-Anomaly / Shadowing-rerouted) → no dispatchable priority. The client owns the map; the human QA
 * gate adjudicates every dispatch.
 */
export function applyPolicy(finding: ModelFinding, rule: PolicySpec): PolicyResult | null {
  if (finding.iecCategory == null) return null;
  const category = finding.iecCategory;
  const priority = priorityForCategory(category, rule.categoryPriority);
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
