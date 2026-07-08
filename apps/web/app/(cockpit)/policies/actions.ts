"use server";

import { revalidatePath } from "next/cache";
import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { createRuleSet, updateRuleSet, deleteRuleSet, type RuleSetInput } from "@/lib/rules/ruleset-admin";

export type PolicyResult = { ok: true } | { ok: false; error: string };

/**
 * DAL rule (M1-01/0a, CR-20): every mutation independently validates the session against the DB
 * (requireSession → auth() → DB) and derives org from it — never trusting middleware or the layout.
 * OPS-1: RuleSet policy is ADMIN-only (REVIEWER is read-only). The check is enforced HERE, at the
 * server boundary, before any tenant write; the mutation runs inside runWithOrg so RLS scopes it.
 */
async function requireAdminOrg() {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("FORBIDDEN: RuleSet policy changes require the ADMIN role");
  return session.organizationId;
}

export async function createPolicyAction(input: RuleSetInput): Promise<PolicyResult> {
  try {
    const organizationId = await requireAdminOrg();
    await runWithOrg(organizationId, async () => {
      await createRuleSet(organizationId, input);
    });
    revalidatePath("/policies");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "create failed" };
  }
}

export async function updatePolicyAction(id: string, input: RuleSetInput): Promise<PolicyResult> {
  try {
    const organizationId = await requireAdminOrg();
    await runWithOrg(organizationId, async () => {
      await updateRuleSet(organizationId, id, input);
    });
    revalidatePath("/policies");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "update failed" };
  }
}

export async function deletePolicyAction(id: string): Promise<PolicyResult> {
  try {
    const organizationId = await requireAdminOrg();
    await runWithOrg(organizationId, async () => {
      await deleteRuleSet(organizationId, id);
    });
    revalidatePath("/policies");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "delete failed" };
  }
}
