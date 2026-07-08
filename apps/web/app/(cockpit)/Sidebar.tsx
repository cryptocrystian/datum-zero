"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "./auth-actions";
import { Insignia } from "./Insignia";

// --- per-route glyphs (16px, stroke=currentColor so they inherit the link state color) ---
type IconProps = { className?: string };
const ico = "h-4 w-4 shrink-0";

function DashboardIcon({ className = ico }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden="true">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="0.75" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="0.75" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="0.75" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="0.75" />
    </svg>
  );
}
function QueueIcon({ className = ico }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h8M6 8h8M6 12.5h8" />
      <path d="M1.5 3.5l1 1 1.5-1.75M1.5 8l1 1 1.5-1.75M1.5 12.5l1 1 1.5-1.75" />
    </svg>
  );
}
function PolicyIcon({ className = ico }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 1.5h7l3 3v10H3z" />
      <path d="M9.5 1.5v3.5H13" />
      <path d="M5.5 8.5h5M5.5 11h3.5" />
    </svg>
  );
}
function IntegrationsIcon({ className = ico }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden="true" strokeLinecap="round">
      <circle cx="3.5" cy="3.5" r="2" />
      <circle cx="12.5" cy="12.5" r="2" />
      <circle cx="12.5" cy="3.5" r="2" />
      <path d="M3.5 5.5v3a2 2 0 002 2h5M12.5 5.5v1" />
    </svg>
  );
}
function RegistryIcon({ className = ico }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden="true" strokeLinejoin="round">
      <path d="M8 1.5l6 3-6 3-6-3 6-3z" />
      <path d="M2 8l6 3 6-3M2 11.5l6 3 6-3" />
    </svg>
  );
}
function AdminIcon({ className = ico }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden="true" strokeLinejoin="round">
      <path d="M8 1.5l5 2v3.5c0 3-2.1 5.4-5 6.5-2.9-1.1-5-3.5-5-6.5V3.5l5-2z" />
      <path d="M5.8 8l1.6 1.6L10.4 6.5" strokeLinecap="round" />
    </svg>
  );
}

// M0/M1 cockpit routes. Only /queue is built; the rest are placeholders (disabled) to avoid dead links.
const ROUTES = [
  { href: "/dashboard", label: "Dashboard", enabled: false, Icon: DashboardIcon },
  { href: "/queue", label: "Validation Queue", enabled: true, Icon: QueueIcon },
  { href: "/policies", label: "RuleSet Policy", enabled: true, Icon: PolicyIcon },
  { href: "/integrations", label: "Integrations", enabled: true, Icon: IntegrationsIcon },
  { href: "/registry", label: "Asset Registry", enabled: false, Icon: RegistryIcon },
  { href: "/admin", label: "Admin", enabled: false, Icon: AdminIcon },
];

export function Sidebar({ user }: { user: { name: string | null; email: string | null; role: string } }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-datum-slate/25 bg-datum-darknavy">
      <div className="flex items-center gap-3 border-b border-datum-slate/20 px-5 py-5">
        <Insignia className="h-9 w-9 shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold uppercase tracking-[0.2em] text-white">
            Datum Zero Systems
          </div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-datum-slate">
            Reality Ledger
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {ROUTES.map((r) => {
          const active = pathname === r.href;
          const Icon = r.Icon;
          if (!r.enabled) {
            return (
              <span
                key={r.href}
                className="flex cursor-not-allowed items-center gap-2.5 px-3 py-2 text-xs uppercase tracking-wider text-datum-slate/40"
                title="Not in current scope"
              >
                <Icon />
                {r.label}
              </span>
            );
          }
          return (
            <Link
              key={r.href}
              href={r.href}
              className={
                "flex items-center gap-2.5 rounded-sm px-3 py-2 text-xs uppercase tracking-wider transition-colors " +
                (active
                  ? "border-l-2 border-tactical-gold bg-datum-cardbg font-semibold text-tactical-gold"
                  : "border-l-2 border-transparent text-white/80 hover:bg-datum-cardbg/40 hover:text-white")
              }
            >
              <Icon />
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
