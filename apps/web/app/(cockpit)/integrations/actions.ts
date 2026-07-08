"use server";

import { revalidatePath } from "next/cache";
import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { createIntegration, updateIntegration, deleteIntegration, type IntegrationInput } from "@/lib/integrations/admin";

export type IntegrationActionResult = { ok: true } | { ok: false; error: string };

/**
 * DAL rule (M1-01/0a, CR-20): every mutation independently validates the session against the DB and
 * derives org from it. OPS-2: integration config is ADMIN-only (REVIEWER read-only); the check is
 * enforced HERE before any tenant write, and the mutation runs inside runWithOrg so RLS scopes it.
 * The lib refuses any raw secret (CR-03) and any route-orphaning delete/deactivate.
 */
async function requireAdminOrg() {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("FORBIDDEN: integration changes require the ADMIN role");
  return session.organizationId;
}

export async function createIntegrationAction(input: IntegrationInput): Promise<IntegrationActionResult> {
  try {
    const organizationId = await requireAdminOrg();
    await runWithOrg(organizationId, async () => {
      await createIntegration(organizationId, input);
    });
    revalidatePath("/integrations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "create failed" };
  }
}

export async function updateIntegrationAction(id: string, input: IntegrationInput): Promise<IntegrationActionResult> {
  try {
    const organizationId = await requireAdminOrg();
    await runWithOrg(organizationId, async () => {
      await updateIntegration(organizationId, id, input);
    });
    revalidatePath("/integrations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "update failed" };
  }
}

export async function deleteIntegrationAction(id: string): Promise<IntegrationActionResult> {
  try {
    const organizationId = await requireAdminOrg();
    await runWithOrg(organizationId, async () => {
      await deleteIntegration(organizationId, id);
    });
    revalidatePath("/integrations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "delete failed" };
  }
}
