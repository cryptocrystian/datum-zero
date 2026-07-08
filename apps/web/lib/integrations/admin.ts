import { prisma, DeliveryTargetType } from "@dz/db";

/**
 * OPS-2 — Integration (delivery-target) administration (CR-05, CR-03, MANIFEST §3).
 *
 * Integrations are the delivery targets RuleSet policies route to. This module exposes the NON-SECRET
 * config only: `targetType`, `displayName`, structured `config` (webhook URL / S3 bucket / Jira
 * baseUrl+projectKey), `secretVaultKey` (a REFERENCE into AWS Secrets Manager — never the secret
 * itself), `isActive`. The actual credential is provisioned out-of-band in the vault (dev: env) and
 * resolved at delivery time (packages/adapters/src/secrets.ts). No raw secret is ever accepted,
 * stored, or returned here (CR-03, MANIFEST §3 — no secrets in the DB/logs/repo).
 *
 * Every function is organizationId-scoped (RLS, M1-02); mutations are ADMIN-gated at the server-action
 * DAL boundary (CR-20). Referential safety (mirrors OPS-1): a delete/deactivate that would orphan a
 * RuleSet route (leave a routed targetType with no active integration) is refused.
 */

// Structured, NON-SECRET config fields per target type. A config key outside this set is rejected —
// there is deliberately no field that could carry a credential.
export const CONFIG_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  GENERIC_WEBHOOK: [{ key: "url", label: "Webhook URL", placeholder: "https://client.example/webhooks/datum-zero" }],
  CSV_S3: [
    { key: "bucket", label: "S3 Bucket", placeholder: "client-datum-zero-dropbox" },
    { key: "prefix", label: "Key Prefix", placeholder: "datum-zero/" },
  ],
  NATIVE_JIRA: [
    { key: "baseUrl", label: "Jira Base URL", placeholder: "https://your-org.atlassian.net" },
    { key: "projectKey", label: "Project Key", placeholder: "DZ" },
  ],
  PDF_DISPATCH: [{ key: "recipientEmail", label: "Recipient Email", placeholder: "crew@client.example" }],
};

export const TARGET_TYPES = Object.values(DeliveryTargetType) as string[];

// A config KEY that names a credential — never allowed (defense-in-depth beyond the whitelist).
const SECRET_KEY = /(token|secret|password|passwd|pwd|api[_-]?key|apikey|credential|authorization|bearer|private[_-]?key|access[_-]?key)/i;
// A VALUE that looks like an actual raw secret — never accepted into config or a vault reference.
const SECRET_VALUE = /(^eyJ[\w-]+\.|^Bearer\s|^sk-[A-Za-z0-9]{16,}|^ghp_[A-Za-z0-9]{20,}|^xox[baprs]-|AKIA[0-9A-Z]{16})/;

export interface IntegrationDTO {
  id: string;
  targetType: string;
  displayName: string;
  config: Record<string, string>;
  secretVaultKey: string | null;
  isActive: boolean;
}

export interface IntegrationInput {
  targetType: string;
  displayName: string;
  config: Record<string, string>;
  secretVaultKey: string | null;
  isActive: boolean;
}

export type Validation = { ok: true } | { ok: false; error: string };

export function allowedConfigKeys(targetType: string): string[] {
  return (CONFIG_FIELDS[targetType] ?? []).map((f) => f.key);
}

/** Pure validation. Enforces the secret discipline: no secret key, no secret-looking value. */
export function validateIntegrationInput(input: IntegrationInput): Validation {
  const name = (input.displayName ?? "").trim();
  if (!name) return { ok: false, error: "displayName is required" };
  if (name.length > 120) return { ok: false, error: "displayName is too long (max 120)" };
  if (!(TARGET_TYPES as string[]).includes(input.targetType)) return { ok: false, error: "unknown targetType" };

  const allowed = allowedConfigKeys(input.targetType);
  const config = input.config ?? {};
  for (const [k, v] of Object.entries(config)) {
    if (SECRET_KEY.test(k)) return { ok: false, error: `config must not carry a secret ('${k}') — reference it via secretVaultKey (CR-03)` };
    if (!allowed.includes(k)) return { ok: false, error: `unknown config field '${k}' for ${input.targetType}` };
    if (typeof v !== "string") return { ok: false, error: `config value for '${k}' must be a string` };
    if (v.length > 500) return { ok: false, error: `config value for '${k}' is too long` };
    if (SECRET_VALUE.test(v.trim())) return { ok: false, error: `config value for '${k}' looks like a raw secret — provision it in the vault, not the DB (CR-03)` };
  }

  const key = (input.secretVaultKey ?? "").trim();
  if (key) {
    // A REFERENCE (e.g. "datumzero/jira/api-token"), never a raw credential.
    if (key.length > 200 || /\s/.test(key)) return { ok: false, error: "secretVaultKey must be a vault reference, not a secret" };
    if (!/^[A-Za-z0-9_\-/:.]+$/.test(key)) return { ok: false, error: "secretVaultKey has invalid characters for a vault reference" };
    if (SECRET_VALUE.test(key)) return { ok: false, error: "secretVaultKey looks like a raw secret — it must be a vault REFERENCE (CR-03)" };
  }
  return { ok: true };
}

const SELECT = { id: true, targetType: true, displayName: true, config: true, secretVaultKey: true, isActive: true } as const;

const toDTO = (r: { id: string; targetType: string; displayName: string; config: unknown; secretVaultKey: string | null; isActive: boolean }): IntegrationDTO => ({
  id: r.id,
  targetType: r.targetType,
  displayName: r.displayName,
  config: (r.config && typeof r.config === "object" ? (r.config as Record<string, string>) : {}),
  secretVaultKey: r.secretVaultKey,
  isActive: r.isActive,
});

/** Read: every integration for the org (ADMIN + REVIEWER). config is non-secret; safe to render. */
export async function listIntegrations(organizationId: string): Promise<IntegrationDTO[]> {
  const rows = await prisma.integration.findMany({
    where: { organizationId },
    orderBy: [{ displayName: "asc" }],
    select: SELECT,
  });
  return rows.map(toDTO);
}

/**
 * Would removing/deactivating `integration` orphan a RuleSet route? True when some RuleSet routes to
 * its targetType and no OTHER active integration of that type would remain. Returns a reason or null.
 */
async function routeOrphanReason(organizationId: string, integrationId: string, targetType: string): Promise<string | null> {
  const otherActive = await prisma.integration.count({
    where: { organizationId, targetType: targetType as DeliveryTargetType, isActive: true, id: { not: integrationId } },
  });
  if (otherActive > 0) return null;
  const routed = await prisma.ruleSet.findMany({ where: { organizationId }, select: { name: true, routeTargets: true } });
  const dependents = routed.filter((r) => r.routeTargets.includes(targetType)).map((r) => r.name);
  if (dependents.length === 0) return null;
  return `${targetType} is the routing target of policy "${dependents[0]}"${dependents.length > 1 ? ` (+${dependents.length - 1} more)` : ""} and has no other active integration — re-route the policy first`;
}

export async function createIntegration(organizationId: string, input: IntegrationInput): Promise<IntegrationDTO> {
  const v = validateIntegrationInput(input);
  if (!v.ok) throw new Error(v.error);
  const created = await prisma.integration.create({
    data: {
      organizationId,
      targetType: input.targetType as DeliveryTargetType,
      displayName: input.displayName.trim(),
      config: input.config,
      secretVaultKey: input.secretVaultKey?.trim() || null,
      isActive: input.isActive,
    },
    select: SELECT,
  });
  return toDTO(created);
}

export async function updateIntegration(organizationId: string, id: string, input: IntegrationInput): Promise<IntegrationDTO> {
  const existing = await prisma.integration.findFirst({ where: { id, organizationId }, select: { id: true, targetType: true, isActive: true } });
  if (!existing) throw new Error("integration not found in org");
  const v = validateIntegrationInput(input);
  if (!v.ok) throw new Error(v.error);

  // Deactivating (or retyping away from) a routed target must not orphan a policy route.
  const losingActiveType = existing.isActive && (!input.isActive || input.targetType !== existing.targetType);
  if (losingActiveType) {
    const reason = await routeOrphanReason(organizationId, id, existing.targetType);
    if (reason) throw new Error(`cannot deactivate: ${reason}`);
  }

  const updated = await prisma.integration.update({
    where: { id },
    data: {
      targetType: input.targetType as DeliveryTargetType,
      displayName: input.displayName.trim(),
      config: input.config,
      secretVaultKey: input.secretVaultKey?.trim() || null,
      isActive: input.isActive,
    },
    select: SELECT,
  });
  return toDTO(updated);
}

export async function deleteIntegration(organizationId: string, id: string): Promise<void> {
  const existing = await prisma.integration.findFirst({ where: { id, organizationId }, select: { id: true, targetType: true, isActive: true } });
  if (!existing) throw new Error("integration not found in org");

  const dispatched = await prisma.workOrderDispatch.count({ where: { organizationId, integrationId: id } });
  if (dispatched > 0) throw new Error(`integration has ${dispatched} dispatch record(s) — cannot delete (audit trail, CR-12)`);

  if (existing.isActive) {
    const reason = await routeOrphanReason(organizationId, id, existing.targetType);
    if (reason) throw new Error(`cannot delete: ${reason}`);
  }
  await prisma.integration.delete({ where: { id } });
}
