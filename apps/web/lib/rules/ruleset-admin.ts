import { prisma, CaptureModality, DeliveryTargetType } from "@dz/db";

/**
 * OPS-1 — RuleSet policy administration (CR-15 amend, CR-12).
 *
 * The RuleSet is the client's configurable POLICY over the model's classification (DET-1c): it
 * configures a match/escalation condition → priority + routeTargets + an evidence-framed
 * recommendation. It NEVER sets the anomaly TYPE (the model owns that, CR-19). This module exposes
 * exactly the fields the policy engine (`applyClientPolicy` / `applyPolicy`) consumes — no more.
 *
 * Every function is organizationId-scoped (multi-tenant native); the caller runs them inside
 * runWithOrg so Postgres RLS enforces the tenant boundary (M1-02). Mutations are ADMIN-gated at the
 * server-action DAL boundary (CR-20). There is NO free-text recommendation field — the recommendation
 * is generated evidence-framed by the engine — so no verdict language can be authored into it (CR-12);
 * the only free-text inputs (name, standardRef) are verdict-guarded here.
 */

// Verdict language is a HARD STOP in any client-facing output (CR-12). This guard blocks authors
// from typing it into a policy name/standardRef; the terms below are the pattern, not emitted copy.
const VERDICT = /\b(violation|breach|back[- ]?charge|penalt(?:y|ies)|liable|guilty|enforce)\b/i; // guardrail:allow-verdict-term

// The metrics the policy engine can actually resolve (tolerance-eval.resolveTriggerValue). Authoring
// a RuleSet on an unresolvable metric would silently never escalate — reject it up front.
export const SUPPORTED_TRIGGER_METRICS = ["Temp_Delta_Threshold"] as const;
export const OPERATORS = [">=", ">", "<=", "<", "=="] as const;
export const MODALITIES = Object.values(CaptureModality) as string[];

export interface RuleSetDTO {
  id: string;
  name: string;
  targetModality: string;
  triggerMetric: string;
  operator: string;
  thresholdValue: number;
  routeTargets: string[];
  standardRef: string | null;
  standardVersion: string | null;
  isTemplate: boolean;
  version: number;
}

export interface RuleSetInput {
  name: string;
  targetModality: string;
  triggerMetric: string;
  operator: string;
  thresholdValue: number;
  routeTargets: string[];
  standardRef: string | null;
  standardVersion: string | null;
  isTemplate: boolean;
}

export type Validation = { ok: true } | { ok: false; error: string };

/**
 * Pure policy-input validation. `allowedRouteTargets` is the set of the org's active-integration
 * target types (routeTargets must be a subset — you cannot route to a target you have not integrated).
 */
export function validateRuleSetInput(input: RuleSetInput, allowedRouteTargets: string[]): Validation {
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };
  if (name.length > 120) return { ok: false, error: "name is too long (max 120)" };
  if (VERDICT.test(name)) return { ok: false, error: "name must be evidence-framed — no verdict language (CR-12)" };

  if (!MODALITIES.includes(input.targetModality)) return { ok: false, error: "unknown targetModality" };
  if (!(SUPPORTED_TRIGGER_METRICS as readonly string[]).includes(input.triggerMetric)) {
    return { ok: false, error: "unsupported triggerMetric (the policy engine cannot resolve it)" };
  }
  if (!(OPERATORS as readonly string[]).includes(input.operator)) return { ok: false, error: "unknown operator" };
  if (typeof input.thresholdValue !== "number" || !Number.isFinite(input.thresholdValue) || input.thresholdValue < 0) {
    return { ok: false, error: "thresholdValue must be a non-negative number (°C escalation floor)" };
  }

  const targets = input.routeTargets ?? [];
  if (targets.length === 0) return { ok: false, error: "select at least one route target" };
  if (new Set(targets).size !== targets.length) return { ok: false, error: "duplicate route targets" };
  for (const t of targets) {
    if (!(Object.values(DeliveryTargetType) as string[]).includes(t)) return { ok: false, error: `unknown route target: ${t}` };
    if (!allowedRouteTargets.includes(t)) return { ok: false, error: `route target ${t} is not an active integration for this org` };
  }

  const std = (input.standardRef ?? "").trim();
  if (std && VERDICT.test(std)) return { ok: false, error: "standardRef must be evidence-framed (CR-12)" };
  return { ok: true };
}

const toDTO = (r: {
  id: string; name: string; targetModality: string; triggerMetric: string; operator: string;
  thresholdValue: number; routeTargets: string[]; standardRef: string | null;
  standardVersion: string | null; isTemplate: boolean; version: number;
}): RuleSetDTO => ({
  id: r.id, name: r.name, targetModality: r.targetModality, triggerMetric: r.triggerMetric,
  operator: r.operator, thresholdValue: r.thresholdValue, routeTargets: r.routeTargets,
  standardRef: r.standardRef, standardVersion: r.standardVersion, isTemplate: r.isTemplate, version: r.version,
});

const SELECT = {
  id: true, name: true, targetModality: true, triggerMetric: true, operator: true,
  thresholdValue: true, routeTargets: true, standardRef: true, standardVersion: true,
  isTemplate: true, version: true,
} as const;

/** Read: every RuleSet for the org (ADMIN + REVIEWER). Highest version per modality applies. */
export async function listRuleSets(organizationId: string): Promise<RuleSetDTO[]> {
  const rows = await prisma.ruleSet.findMany({
    where: { organizationId },
    orderBy: [{ targetModality: "asc" }, { version: "desc" }],
    select: SELECT,
  });
  return rows.map(toDTO);
}

/** The active-integration target types the org may route to (options for the routeTargets picker). */
export async function listAllowedRouteTargets(organizationId: string): Promise<string[]> {
  const rows = await prisma.integration.findMany({
    where: { organizationId, isActive: true },
    select: { targetType: true },
  });
  return [...new Set(rows.map((r) => r.targetType as string))].sort();
}

/**
 * Create a client policy. A new RuleSet for a modality forks above the current highest version so it
 * becomes authoritative (CR-15: overrides fork the shipped default). ADMIN-gated by the caller.
 */
export async function createRuleSet(organizationId: string, input: RuleSetInput): Promise<RuleSetDTO> {
  const allowed = await listAllowedRouteTargets(organizationId);
  const v = validateRuleSetInput(input, allowed);
  if (!v.ok) throw new Error(v.error);

  const top = await prisma.ruleSet.findFirst({
    where: { organizationId, targetModality: input.targetModality as CaptureModality },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const created = await prisma.ruleSet.create({
    data: {
      organizationId,
      name: input.name.trim(),
      targetModality: input.targetModality as CaptureModality,
      triggerMetric: input.triggerMetric,
      operator: input.operator,
      thresholdValue: input.thresholdValue,
      routeTargets: input.routeTargets,
      standardRef: input.standardRef?.trim() || null,
      standardVersion: input.standardVersion?.trim() || null,
      isTemplate: input.isTemplate,
      version: (top?.version ?? 0) + 1,
    },
    select: SELECT,
  });
  return toDTO(created);
}

/** Edit a policy in place (version preserved). Tenant-guarded. ADMIN-gated by the caller. */
export async function updateRuleSet(organizationId: string, id: string, input: RuleSetInput): Promise<RuleSetDTO> {
  const existing = await prisma.ruleSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("policy not found in org");

  const allowed = await listAllowedRouteTargets(organizationId);
  const v = validateRuleSetInput(input, allowed);
  if (!v.ok) throw new Error(v.error);

  const updated = await prisma.ruleSet.update({
    where: { id },
    data: {
      name: input.name.trim(),
      targetModality: input.targetModality as CaptureModality,
      triggerMetric: input.triggerMetric,
      operator: input.operator,
      thresholdValue: input.thresholdValue,
      routeTargets: input.routeTargets,
      standardRef: input.standardRef?.trim() || null,
      standardVersion: input.standardVersion?.trim() || null,
      isTemplate: input.isTemplate,
    },
    select: SELECT,
  });
  return toDTO(updated);
}

/**
 * Delete a policy. Refuses if any anomaly references it — deleting would orphan an audit chain
 * (CR-12 immutable provenance). Tenant-guarded. ADMIN-gated by the caller.
 */
export async function deleteRuleSet(organizationId: string, id: string): Promise<void> {
  const existing = await prisma.ruleSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("policy not found in org");
  const inUse = await prisma.anomaly.count({ where: { organizationId, ruleSetId: id } });
  if (inUse > 0) throw new Error(`policy is referenced by ${inUse} finding(s) — cannot delete (audit trail, CR-12)`);
  await prisma.ruleSet.delete({ where: { id } });
}
