"use server";

import { revalidatePath } from "next/cache";
import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { createUser, updateUser, deleteUser, type UserInput } from "@/lib/users/admin";

export type UserActionResult = { ok: true } | { ok: false; error: string };

/**
 * DAL rule (M1-01/0a, CR-20): every mutation validates the session against the DB and derives org
 * from it. OPS-4: user management is ADMIN-ONLY (REVIEWER/PILOT cannot reach this surface). The acting
 * user's id is passed to the lib for the self-lockout rails.
 *
 * ⚠ The User table is RLS-EXEMPT (M1-02) — runWithOrg sets the GUC but Postgres will NOT scope User
 * rows. The tenant boundary here is the EXPLICIT organizationId filter in @/lib/users/admin.
 */
async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("FORBIDDEN: user management requires the ADMIN role");
  return { organizationId: session.organizationId, actingUserId: session.userId };
}

export async function createUserAction(input: UserInput): Promise<UserActionResult> {
  try {
    const { organizationId } = await requireAdmin();
    await runWithOrg(organizationId, async () => { await createUser(organizationId, input); });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "create failed" };
  }
}

export async function updateUserAction(id: string, input: { name: string | null; role: string; isActive: boolean }): Promise<UserActionResult> {
  try {
    const { organizationId, actingUserId } = await requireAdmin();
    await runWithOrg(organizationId, async () => { await updateUser(organizationId, id, input, actingUserId); });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "update failed" };
  }
}

export async function deleteUserAction(id: string): Promise<UserActionResult> {
  try {
    const { organizationId, actingUserId } = await requireAdmin();
    await runWithOrg(organizationId, async () => { await deleteUser(organizationId, id, actingUserId); });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "delete failed" };
  }
}
