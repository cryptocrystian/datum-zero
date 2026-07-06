"use client";

import { useState } from "react";
import type { AssetDTO, IntegrationDTO, QueueItemDTO } from "@/lib/qa/review";
import { ReviewPanel } from "./ReviewPanel";

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function ReviewQueue({
  items,
  assets,
  integrations,
}: {
  items: QueueItemDTO[];
  assets: AssetDTO[];
  integrations: IntegrationDTO[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  if (items.length === 0) {
    return (
      <div className="blueprint-grid flex h-64 items-center justify-center rounded-sm border border-datum-slate/25">
        <span className="font-mono text-sm uppercase tracking-wider text-datum-slate">
          Queue clear — no anomalies awaiting review
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Queue list */}
      <div className="col-span-12 lg:col-span-3">
        <div className="overflow-hidden rounded-sm border border-datum-slate/30 bg-datum-cardbg">
          <div className="flex items-center justify-between border-b border-datum-slate/25 bg-datum-darknavy/60 px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">Pending QA</span>
            <span className="font-mono text-[10px] text-tactical-gold">{String(items.length).padStart(2, "0")}</span>
          </div>
          <ul className="divide-y divide-datum-slate/15">
            {items.map((i) => {
              const active = i.id === selectedId;
              const unbound = i.spatialBindingStatus === "UNBOUND_REVIEW";
              return (
                <li key={i.id}>
                  <button
                    onClick={() => setSelectedId(i.id)}
                    className={
                      "block w-full border-l-2 px-3 py-2.5 text-left transition-colors " +
                      (active
                        ? "border-tactical-gold bg-datum-midnight/60"
                        : "border-transparent hover:border-datum-slate/60 hover:bg-datum-midnight/30")
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-white">{shortId(i.id)}</span>
                      <span
                        className={
                          "rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
                          (unbound
                            ? "border-tactical-goldmuted/50 text-tactical-goldmuted"
                            : "border-status-green/40 text-status-green")
                        }
                      >
                        {unbound ? "Unbound" : "Bound"}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-datum-slate">
                      {i.internalLabel ?? "— unbound —"}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-tactical-gold">
                      +{i.metricDelta.toFixed(1)}°C Δ
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Detail: reality viewport + routing console */}
      <div className="col-span-12 lg:col-span-9">
        {selected ? (
          <ReviewPanel key={selected.id} item={selected} assets={assets} integrations={integrations} />
        ) : null}
      </div>
    </div>
  );
}
