import { prisma, UserRole } from "@dz/db";

/**
 * OPS-4 — org user administration (CR-14, CR-20). Concierge model: an ADMIN provisions users by
 * email + role; there is no self-serve signup. A provisioned+active user can then magic-link sign in.
 *
 * ⚠ HIGHEST-RISK SURFACE. The auth substrate (User/Account/Session/VerificationToken) is RLS-EXEMPT
 * (M1-02) because sign-in must resolve a user BEFORE any org context exists. That means the database
 * does NOT backstop a missed tenant filter here — a forgotten `organizationId` is a real cross-tenant
 * leak. Therefore EVERY query in this module is explicitly organizationId-scoped, and we use
 * findFirst / updateMany / deleteMany / count / create (which accept a non-unique org filter) and
 * NEVER findUnique / update / delete (unique-key-only, which would bypass the org scope).
 *
 * Safety rails: an ADMIN cannot deactivate/delete themselves (no lockout) and cannot remove the last
 * active ADMIN (no orphaned org). Deactivation (isActive=false) blocks the next sign-in
 * (lib/auth-core.isEligibleForSignIn) and preserves the audit trail; hard delete is refused when the
 * user has reviewed anomalies (CR-12) — deactivate instead.
 */

export const ROLES = Object.values(UserRole) as string[];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
}

export interface UserInput {
  email: string;
  name: string | null;
  role: string;
}

export type Validation = { ok: true } | { ok: false; error: string };

export function validateUserInput(input: UserInput): Validation {
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "email is required" };
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "email is not a valid address" };
  if (!ROLES.includes(input.role)) return { ok: false, error: "unknown role" };
  if ((input.name ?? "").length > 120) return { ok: false, error: "name is too long (max 120)" };
  return { ok: true };
}

const SELECT = { id: true, email: true, name: true, role: true, isActive: true } as const;
const toDTO = (u: { id: string; email: string; name: string | null; role: string; isActive: boolean }): UserDTO => ({
  id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive,
});

/** Every user query below is organizationId-scoped — the DB will NOT catch a missed filter (RLS-exempt). */
async function otherActiveAdminCount(organizationId: string, excludeId: string): Promise<number> {
  return prisma.user.count({
    where: { organizationId, role: "ADMIN", isActive: true, id: { not: excludeId } },
  });
}

/** Read: every user in the acting ADMIN's org (org-scoped). */
export async function listUsers(organizationId: string): Promise<UserDTO[]> {
  const rows = await prisma.user.findMany({
    where: { organizationId },
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
    select: SELECT,
  });
  return rows.map(toDTO);
}

/** Provision a user into the acting ADMIN's org (concierge, CR-14). Email is globally unique. */
export async function createUser(organizationId: string, input: UserInput): Promise<UserDTO> {
  const v = validateUserInput(input);
  if (!v.ok) throw new Error(v.error);
  try {
    const created = await prisma.user.create({
      data: {
        organizationId,
        email: input.email.trim().toLowerCase(),
        name: input.name?.trim() || null,
        role: input.role as UserRole,
        isActive: true,
      },
      select: SELECT,
    });
    return toDTO(created);
  } catch (e) {
    // Unique-email collision (possibly in another org) — do not leak which org; generic message.
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      throw new Error("that email is already provisioned");
    }
    throw e;
  }
}

/** Edit a user in the acting ADMIN's org: name, role, isActive. Enforces the safety rails. */
export async function updateUser(
  organizationId: string,
  id: string,
  input: { name: string | null; role: string; isActive: boolean },
  actingUserId: string,
): Promise<UserDTO> {
  const target = await prisma.user.findFirst({ where: { id, organizationId }, select: { id: true, role: true, isActive: true } });
  if (!target) throw new Error("user not found in org");
  if (!ROLES.includes(input.role)) throw new Error("unknown role");
  if ((input.name ?? "").length > 120) throw new Error("name is too long (max 120)");

  const isSelf = id === actingUserId;
  if (isSelf && input.isActive === false) throw new Error("you cannot deactivate yourself (no lockout)");
  if (isSelf && input.role !== target.role) throw new Error("you cannot change your own role (no lockout)");

  // Removing the last active ADMIN — by deactivating OR demoting the last one — orphans the org.
  const removesAdminPrivilege = target.role === "ADMIN" && target.isActive && (input.role !== "ADMIN" || input.isActive === false);
  if (removesAdminPrivilege && (await otherActiveAdminCount(organizationId, id)) === 0) {
    throw new Error("cannot remove the last active ADMIN of the org");
  }

  const res = await prisma.user.updateMany({
    where: { id, organizationId },
    data: { name: input.name?.trim() || null, role: input.role as UserRole, isActive: input.isActive },
  });
  if (res.count !== 1) throw new Error("user not found in org");
  const updated = await prisma.user.findFirst({ where: { id, organizationId }, select: SELECT });
  return toDTO(updated!);
}

/** Hard-delete a user in the acting ADMIN's org. Refused for self, last active ADMIN, or audit refs. */
export async function deleteUser(organizationId: string, id: string, actingUserId: string): Promise<void> {
  if (id === actingUserId) throw new Error("you cannot delete yourself (no lockout)");
  const target = await prisma.user.findFirst({ where: { id, organizationId }, select: { id: true, role: true, isActive: true } });
  if (!target) throw new Error("user not found in org");

  if (target.role === "ADMIN" && target.isActive && (await otherActiveAdminCount(organizationId, id)) === 0) {
    throw new Error("cannot delete the last active ADMIN of the org");
  }
  const reviewed = await prisma.anomaly.count({ where: { organizationId, reviewedById: id } });
  if (reviewed > 0) throw new Error(`user has reviewed ${reviewed} finding(s) — deactivate instead of deleting (audit trail, CR-12)`);

  const res = await prisma.user.deleteMany({ where: { id, organizationId } });
  if (res.count !== 1) throw new Error("user not found in org");
}
