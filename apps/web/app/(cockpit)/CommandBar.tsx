"use client";

import { useState } from "react";
import * as Select from "@radix-ui/react-select";

/** Live-ingestion equalizer — a staggered five-bar pulse. Decorative, success-green. */
function NodeActivity() {
  const bars = [0, 0.15, 0.3, 0.45, 0.6];
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">Node Activity</span>
      <div className="flex h-4 items-end gap-[3px]" aria-hidden="true">
        {bars.map((delay, i) => (
          <span
            key={i}
            className="node-bar block w-[3px] rounded-[1px] bg-status-green"
            style={{ height: "100%", animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Top command bar (M1-03): Site Selector · Node Activity · System Status. The site names the
 * physical project (SITE_ID, CR-17) — distinct from the tenant Organization; one operator runs
 * many sites and this switches the working context.
 */
export function CommandBar({ sites }: { sites: string[] }) {
  const [site, setSite] = useState(sites[0] ?? "");

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-datum-slate/25 bg-datum-darknavy/80 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">Site</span>
        {sites.length > 0 ? (
          <Select.Root value={site} onValueChange={setSite}>
            <Select.Trigger className="flex items-center gap-2 rounded-sm border border-datum-slate/60 bg-datum-cardbg px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-white outline-none transition-colors hover:border-datum-slate focus:border-tactical-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-tactical-gold" />
              <Select.Value />
              <Select.Icon className="text-datum-slate">▾</Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                className="z-50 min-w-[var(--radix-select-trigger-width)] rounded-sm border border-datum-slate bg-datum-darknavy shadow-lg"
              >
                <Select.Viewport className="p-1">
                  {sites.map((s) => (
                    <Select.Item
                      key={s}
                      value={s}
                      className="cursor-pointer select-none rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-white outline-none data-[highlighted]:bg-datum-cardbg data-[highlighted]:text-tactical-gold"
                    >
                      <Select.ItemText>{s}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        ) : (
          <span className="rounded-sm border border-datum-slate/40 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-datum-slate">
            No site
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        <NodeActivity />
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-status-green shadow-[0_0_6px_var(--color-status-green)]" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">
            System Status: <span className="text-status-green">OK</span>
          </span>
        </div>
      </div>
    </header>
  );
}
