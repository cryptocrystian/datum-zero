"use server";

import { revalidatePath } from "next/cache";
import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { createAsset, updateAsset, deleteAsset, importAssetsCsv, type AssetInput, type ImportResult } from "@/lib/registry/asset-admin";

export type AssetActionResult = { ok: true } | { ok: false; error: string };
export type ImportActionResult = { ok: true; result: ImportResult } | { ok: false; error: string };

/**
 * DAL rule (M1-01/0a, CR-20): every mutation independently validates the session against the DB and
 * derives org from it. OPS-3: registry edits are ADMIN-only (REVIEWER read-only); the check is enforced
 * HERE before any tenant write, and the mutation runs inside runWithOrg so RLS scopes it (M1-02).
 */
async function requireAdminOrg() {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("FORBIDDEN: registry changes require the ADMIN role");
  return session.organizationId;
}

export async function createAssetAction(input: AssetInput): Promise<AssetActionResult> {
  try {
    const organizationId = await requireAdminOrg();
    await runWithOrg(organizationId, async () => { await createAsset(organizationId, input); });
    revalidatePath("/registry");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "create failed" };
  }
}

export async function updateAssetAction(id: string, input: AssetInput): Promise<AssetActionResult> {
  try {
    const organizationId = await requireAdminOrg();
    await runWithOrg(organizationId, async () => { await updateAsset(organizationId, id, input); });
    revalidatePath("/registry");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "update failed" };
  }
}

export async function deleteAssetAction(id: string): Promise<AssetActionResult> {
  try {
    const organizationId = await requireAdminOrg();
    await runWithOrg(organizationId, async () => { await deleteAsset(organizationId, id); });
    revalidatePath("/registry");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "delete failed" };
  }
}

export async function importAssetsAction(csvText: string): Promise<ImportActionResult> {
  try {
    const organizationId = await requireAdminOrg();
    const result = await runWithOrg(organizationId, async () => importAssetsCsv(organizationId, csvText));
    revalidatePath("/registry");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "import failed" };
  }
}
