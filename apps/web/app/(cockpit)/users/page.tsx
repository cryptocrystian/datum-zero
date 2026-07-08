import { redirect } from "next/navigation";
import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { listUsers, ROLES } from "@/lib/users/admin";
import { UserManagement } from "./UserManagement";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  // Validate the session at the DAL (M1-01/0a, CR-20). ADMIN-ONLY: REVIEWER/PILOT are redirected out —
  // this surface is not read-only for non-admins, it is inaccessible.
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/queue");

  const orgId = session.organizationId;
  const users = await runWithOrg(orgId, async () => listUsers(orgId));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between border-b border-datum-slate/25 pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-white">Users</h1>
          <p className="mt-1 max-w-2xl text-xs uppercase tracking-wider text-datum-slate">
            Concierge provisioning — an ADMIN grants access by email + role. No self-serve signup; a
            provisioned, active user then signs in by magic link.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold text-tactical-gold">{String(users.length).padStart(2, "0")}</div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-datum-slate">Users · ADMIN</div>
        </div>
      </header>

      <UserManagement users={users} selfId={session.userId} roles={ROLES} />
    </div>
  );
}
