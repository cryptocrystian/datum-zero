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
      <div className="col-span-12 space-y-2 lg:col-span-3">
        {items.map((i) => {
          const active = i.id === selectedId;
          const unbound = i.spatialBindingStatus === "UNBOUND_REVIEW";
          return (
            <button
              key={i.id}
              onClick={() => setSelectedId(i.id)}
              className={
                "block w-full rounded-sm border px-3 py-3 text-left transition-colors " +
                (active
                  ? "border-tactical-gold bg-datum-cardbg"
                  : "border-datum-slate/25 bg-datum-cardbg/50 hover:border-datum-slate/60")
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-white">{shortId(i.id)}</span>
                <span
                  className={
                    "font-mono text-[10px] uppercase tracking-wider " +
                    (unbound ? "text-tactical-goldmuted" : "text-status-green")
                  }
                >
                  {unbound ? "Unbound" : "Bound"}
                </span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-datum-slate">
                {i.internalLabel ?? "— unbound —"}
              </div>
              <div className="mt-1 font-mono text-[11px] text-tactical-gold">
                +{i.metricDelta.toFixed(1)}°C Δ
              </div>
            </button>
          );
        })}
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
