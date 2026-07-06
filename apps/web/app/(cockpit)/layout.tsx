import { redirect } from "next/navigation";
import { runWithOrg } from "@dz/db";
import { getSession } from "@/lib/session";
import { listOrgSites } from "@/lib/qa/review";
import { Sidebar } from "./Sidebar";
import { CommandBar } from "./CommandBar";

// Back-office cockpit shell (CR-06): 260px fixed sidebar + top command bar + content stage.
// AUTHORITATIVE auth gate (CR-20): validate the real session (auth() → DB); redirect if absent.
export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/signin");

  // Org-scoped site list for the command bar (RLS-bound, M1-02).
  const sites = await runWithOrg(session.organizationId, async () => listOrgSites(session.organizationId));

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: session.name, email: session.email, role: session.role }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <CommandBar sites={sites} />
        <main className="canvas-grid min-w-0 flex-1 bg-datum-midnight p-6">{children}</main>
      </div>
    </div>
  );
}
