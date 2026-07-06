import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Sidebar } from "./Sidebar";

// Back-office cockpit shell (CR-06): 260px fixed sidebar + content stage.
// AUTHORITATIVE auth gate (CR-20): validate the real session (auth() → DB); redirect if absent.
export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/signin");

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: session.name, email: session.email, role: session.role }} />
      <main className="min-w-0 flex-1 bg-datum-midnight p-6">{children}</main>
    </div>
  );
}
