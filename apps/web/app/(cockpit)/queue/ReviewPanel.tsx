"use client";

import { useState, useTransition } from "react";
import * as Slider from "@radix-ui/react-slider";
import * as Select from "@radix-ui/react-select";
import type { AssetDTO, IntegrationDTO, QueueItemDTO } from "@/lib/qa/review";
import { approveAction, rejectAction, bindAction, type ActionResult } from "./actions";
import { CoordinateInset } from "./CoordinateInset";
import { PayloadPreview } from "./PayloadPreview";

const FRAME_W = 640;
const FRAME_H = 512;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-datum-slate">{children}</div>
  );
}

function DataField({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-datum-slate">
        {label}
      </span>
      <input
        readOnly
        value={value}
        className={
          "w-full rounded-sm border border-datum-slate bg-datum-darknavy px-2 py-1.5 font-mono text-xs " +
          (accent ? "text-tactical-gold" : "text-white")
        }
      />
    </label>
  );
}

function TacticalSelect({
  value,
  onValueChange,
  placeholder,
  items,
}: {
  value?: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  items: { value: string; label: string }[];
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger className="flex w-full items-center justify-between rounded-sm border border-datum-slate bg-datum-darknavy px-3 py-2 font-mono text-xs text-white outline-none focus:border-tactical-gold">
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="text-datum-slate">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] rounded-sm border border-datum-slate bg-datum-darknavy shadow-lg"
        >
          <Select.Viewport className="p-1">
            {items.map((it) => (
              <Select.Item
                key={it.value}
                value={it.value}
                className="cursor-pointer select-none rounded-sm px-3 py-2 font-mono text-xs text-white outline-none data-[highlighted]:bg-datum-cardbg data-[highlighted]:text-tactical-gold"
              >
                <Select.ItemText>{it.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function ReviewPanel({
  item,
  assets,
  integrations,
}: {
  item: QueueItemDTO;
  assets: AssetDTO[];
  integrations: IntegrationDTO[];
}) {
  const [reveal, setReveal] = useState(50);
  const [targetId, setTargetId] = useState<string | undefined>(integrations[0]?.id);
  const [bindAssetId, setBindAssetId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unbound = item.spatialBindingStatus === "UNBOUND_REVIEW";
  const [x1, y1, x2, y2] = item.boundingBox;
  const box = {
    left: `${(x1 / FRAME_W) * 100}%`,
    top: `${(y1 / FRAME_H) * 100}%`,
    width: `${((x2 - x1) / FRAME_W) * 100}%`,
    height: `${((y2 - y1) / FRAME_H) * 100}%`,
  };

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Pane A — Reality Viewport (55%) */}
      <section className="rounded-sm border border-datum-slate/25 bg-datum-cardbg p-4 lg:basis-[55%]">
        <SectionLabel>Reality Viewport · RGB | Thermal</SectionLabel>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm border border-datum-slate/30 bg-datum-darknavy">
          {/* RGB base */}
          <div className="absolute inset-0 bg-gradient-to-br from-datum-charcoal via-datum-darknavy to-black" />
          {/* Thermal overlay, revealed left→right by the slider */}
          <div
            className="absolute inset-0 bg-gradient-to-tr from-[#101044] via-tactical-red to-tactical-gold"
            style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
          />
          {/* Bounding box */}
          <div className="absolute border border-tactical-gold" style={box}>
            <span className="absolute -top-4 left-0 font-mono text-[9px] text-tactical-gold">
              +{item.metricDelta.toFixed(1)}°C
            </span>
          </div>
          {/* Reveal divider (col-resize) */}
          <div
            className="absolute top-0 bottom-0 w-px cursor-col-resize bg-tactical-gold/70"
            style={{ left: `${reveal}%` }}
          />
          <span className="absolute left-2 top-2 font-mono text-[10px] uppercase tracking-wider text-white/70">
            RGB
          </span>
          <span className="absolute right-2 top-2 font-mono text-[10px] uppercase tracking-wider text-tactical-gold">
            Thermal
          </span>
        </div>

        <div className="mt-3">
          <Slider.Root
            className="relative flex h-5 w-full touch-none select-none items-center"
            value={[reveal]}
            onValueChange={([v]) => setReveal(v)}
            min={0}
            max={100}
            step={1}
            aria-label="RGB / thermal reveal"
          >
            <Slider.Track className="relative h-1 w-full grow rounded-full bg-datum-slate/40">
              <Slider.Range className="absolute h-full rounded-full bg-tactical-gold/60" />
            </Slider.Track>
            <Slider.Thumb className="block h-4 w-2 cursor-col-resize rounded-sm bg-tactical-gold outline-none" />
          </Slider.Root>
        </div>

        <div className="mt-2 space-y-0.5 font-mono text-[10px] text-datum-slate">
          <div className="truncate">RGB: {item.visualCropUrl}</div>
          <div className="truncate">IR: {item.analyticsCropUrl}</div>
        </div>

        <CoordinateInset latitude={item.latitude} longitude={item.longitude} />
      </section>

      {/* Pane B — Operational Routing Console (45%) */}
      <section className="flex flex-col gap-4 rounded-sm border border-datum-slate/25 bg-datum-cardbg p-4 lg:basis-[45%]">
        <SectionLabel>Operational Routing Console</SectionLabel>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <DataField label="Asset (internalLabel)" value={item.internalLabel ?? "— unbound —"} accent={!unbound} />
          </div>
          <DataField label="Modality" value={item.modality} />
          <DataField label="Model" value={item.modelVersion ?? "—"} />
          <DataField label="Confidence" value={`${(item.confidenceScore * 100).toFixed(1)}%`} />
          <DataField label="Thermal Variance" value={`+${item.metricDelta.toFixed(1)}°C vs. median`} accent />
          <DataField label="Standard" value={item.standardRef ?? "—"} />
          <DataField label="Classification" value={item.classification ?? "— pending bind —"} />
        </div>

        <div>
          <SectionLabel>Recommendation (Evidence)</SectionLabel>
          <p className="rounded-sm border border-datum-slate/30 bg-datum-darknavy px-3 py-2 font-mono text-[11px] leading-relaxed text-white/90">
            {item.recommendation ?? "Awaiting classification — bind this detection to an asset to evaluate."}
          </p>
        </div>

        <PayloadPreview item={item} />

        {unbound ? (
          <div>
            <SectionLabel>Manual Asset Binding</SectionLabel>
            <div className="flex flex-col gap-2">
              <TacticalSelect
                value={bindAssetId}
                onValueChange={setBindAssetId}
                placeholder="Select asset by internalLabel…"
                items={assets.map((a) => ({ value: a.id, label: a.internalLabel }))}
              />
              <button
                type="button"
                disabled={!bindAssetId || pending}
                onClick={() => bindAssetId && run(() => bindAction(item.id, bindAssetId))}
                className="rounded-sm border border-tactical-goldmuted bg-datum-midnight px-3 py-2 font-mono text-xs uppercase tracking-wider text-white transition-colors duration-150 hover:bg-tactical-goldmuted disabled:cursor-not-allowed disabled:opacity-40"
              >
                [ Bind Asset ]
              </button>
            </div>
          </div>
        ) : (
          <div>
            <SectionLabel>Target System</SectionLabel>
            <TacticalSelect
              value={targetId}
              onValueChange={setTargetId}
              placeholder="Select delivery target…"
              items={integrations.map((i) => ({ value: i.id, label: `${i.displayName} · ${i.targetType}` }))}
            />
            <p className="mt-1 font-mono text-[10px] text-datum-slate">
              Dispatch is enqueued to the outbox on approval (M0-09).
            </p>
          </div>
        )}

        {error ? (
          <p className="rounded-sm border border-tactical-red px-3 py-2 font-mono text-[11px] text-tactical-red">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex gap-3 pt-2">
          <button
            type="button"
            disabled={unbound || pending}
            onClick={() => run(() => approveAction(item.id))}
            className="flex-1 rounded-sm border border-tactical-gold bg-datum-midnight px-3 py-2.5 font-mono text-xs uppercase tracking-wider text-white transition-colors duration-150 hover:bg-tactical-gold hover:text-datum-midnight disabled:cursor-not-allowed disabled:opacity-40"
            title={unbound ? "Bind to an asset before approving" : undefined}
          >
            [ Approve for Dispatch ]
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => rejectAction(item.id))}
            className="flex-1 rounded-sm border border-tactical-red bg-transparent px-3 py-2.5 font-mono text-xs uppercase tracking-wider text-tactical-red transition-colors duration-150 hover:bg-tactical-red hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            [ Reject ]
          </button>
        </div>
      </section>
    </div>
  );
}
