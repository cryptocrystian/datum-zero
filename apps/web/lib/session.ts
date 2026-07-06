import type { UserRole } from "@dz/db";
import { auth } from "../auth";

/**
 * Thin session interface (M1-01, CR-20). The whole app derives identity + tenant scope from HERE,
 * so the auth provider can be swapped without touching callers. Backed by the real Auth.js session
 * (database strategy); no stub identity, no hardcoded org.
 */
export interface AppSession {
  userId: string;
  organizationId: string;
  role: UserRole;
  email: string | null;
  name: string | null;
}

export async function getSession(): Promise<AppSession | null> {
  const s = await auth();
  if (!s?.user?.id || !s.user.organizationId) return null;
  return {
    userId: s.user.id,
    organizationId: s.user.organizationId,
    role: s.user.role,
    email: s.user.email ?? null,
    name: s.user.name ?? null,
  };
}

export async function requireSession(): Promise<AppSession> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}

/** Tenant scope for the authenticated user (multi-tenant native — never a hardcoded id). */
export async function getCurrentOrgId(): Promise<string> {
  return (await requireSession()).organizationId;
}

/** The authenticated reviewer — QA approvals stamp this real user id. */
export async function getCurrentReviewer(): Promise<{ id: string; name: string }> {
  const s = await requireSession();
  return { id: s.userId, name: s.name ?? s.email ?? s.userId };
}
