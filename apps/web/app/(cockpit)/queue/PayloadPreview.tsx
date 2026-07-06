"use client";

import { useState } from "react";
import type { QueueItemDTO } from "@/lib/qa/review";

/**
 * Evidence-framed preview of the canonical work-order payload for the selected detection — mono,
 * snake_case on the wire (MANIFEST §3), rendered from the same measurement fields the outbox
 * dispatches. Preview only: dispatch/reviewer identifiers are stamped at approval time (CR-12).
 * No verdict language — the recommendation surfaces measurements, not an adjudication.
 */
function previewPayload(item: QueueItemDTO) {
  return {
    schema_version: "1.0.0",
    asset: {
      internal_label: item.internalLabel,
      latitude: item.latitude,
      longitude: item.longitude,
    },
    anomaly: {
      classification: item.classification,
      confidence_score: item.confidenceScore,
      metric_delta: item.metricDelta,
      metric_unit: item.metricUnit,
      standard_ref: item.standardRef,
      model_version: item.modelVersion,
      bounding_box: item.boundingBox,
      recommendation: item.recommendation,
    },
    capture: { modality: item.modality },
  };
}

/** Safe, minimal JSON syntax highlight: keys slate, strings white, numbers gold, literals green. */
function highlight(json: string): React.ReactNode[] {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) out.push(json.slice(last, m.index));
    if (m[1] !== undefined) {
      const isKey = m[2] !== undefined;
      out.push(
        <span key={k++} className={isKey ? "text-datum-slate" : "text-white/90"}>
          {m[1]}
        </span>,
      );
      if (m[2] !== undefined) out.push(<span key={k++} className="text-datum-slate">{m[2]}</span>);
    } else if (m[3] !== undefined) {
      out.push(<span key={k++} className="text-status-green">{m[3]}</span>);
    } else if (m[4] !== undefined) {
      out.push(<span key={k++} className="text-tactical-goldmuted">{m[4]}</span>);
    }
    last = re.lastIndex;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}

export function PayloadPreview({ item }: { item: QueueItemDTO }) {
  const [open, setOpen] = useState(true);
  const json = JSON.stringify(previewPayload(item), null, 2);

  return (
    <div className="rounded-sm border border-datum-slate/30 bg-datum-darknavy">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-datum-slate/20 px-3 py-1.5 text-left"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">
          Work-Order Payload · Preview
        </span>
        <span className="font-mono text-[10px] text-datum-slate">{open ? "[ − ]" : "[ + ]"}</span>
      </button>
      {open ? (
        <pre className="max-h-52 overflow-auto px-3 py-2 font-mono text-[11px] leading-[18px] text-datum-slate">
          {highlight(json)}
        </pre>
      ) : null}
    </div>
  );
}
