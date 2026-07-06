"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "./auth-actions";

// M0 cockpit routes. Only /queue is built; the rest are placeholders (disabled) to avoid dead links.
const ROUTES = [
  { href: "/dashboard", label: "Dashboard", enabled: false },
  { href: "/queue", label: "Validation Queue", enabled: true },
  { href: "/integrations", label: "Integrations", enabled: false },
  { href: "/registry", label: "Asset Registry", enabled: false },
  { href: "/admin", label: "Admin", enabled: false },
];

export function Sidebar({ user }: { user: { name: string | null; email: string | null; role: string } }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-datum-slate/25 bg-datum-darknavy">
      <div className="border-b border-datum-slate/20 px-5 py-5">
        <div className="text-sm font-bold uppercase tracking-[0.25em] text-white">Datum Zero</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-datum-slate">
          Reality Ledger
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {ROUTES.map((r) => {
          const active = pathname === r.href;
          if (!r.enabled) {
            return (
              <span
                key={r.href}
                className="block cursor-not-allowed px-3 py-2 text-xs uppercase tracking-wider text-datum-slate/40"
                title="Not in M0 scope"
              >
                {r.label}
              </span>
            );
          }
          return (
            <Link
              key={r.href}
              href={r.href}
              className={
                "block px-3 py-2 text-xs uppercase tracking-wider transition-colors " +
                (active
                  ? "border-l-2 border-tactical-gold bg-datum-cardbg font-semibold text-tactical-gold"
                  : "text-white/80 hover:text-white")
              }
            >
              {active ? `[ ${r.label} ]` : r.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-datum-slate/20 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-status-green shadow-[0_0_6px_var(--color-status-green)]" />
          <span className="font-mono text-[11px] uppercase tracking-wide text-datum-slate">
            System Status: OK
          </span>
        </div>

        <div className="border-t border-datum-slate/20 pt-3">
          <div className="truncate font-mono text-[11px] text-white">{user.name ?? user.email}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">{user.role}</div>
          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-sm border border-datum-slate/60 px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-datum-slate transition-colors hover:border-tactical-red hover:text-tactical-red"
            >
              [ Sign out ]
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
