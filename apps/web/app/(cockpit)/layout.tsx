import { Sidebar } from "./Sidebar";

// Back-office cockpit shell (CR-06): 260px fixed sidebar + content stage.
export default function CockpitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 bg-datum-midnight p-6">{children}</main>
    </div>
  );
}
