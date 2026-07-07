"use client";

import type { CheckKey, CheckStatus, ValidationReport } from "@/lib/field/validation";

const CHIP: Record<CheckStatus, string> = {
  PASS: "border-status-green/40 text-status-green",
  WARN: "border-tactical-goldmuted/50 text-tactical-goldmuted",
  FAIL: "border-tactical-red/60 text-tactical-red",
};

const CHECK_LABEL: Record<CheckKey, string> = {
  frame: "Frame",
  gps: "GPS",
  sunGlare: "Sun",
  exposure: "Exposure",
  overlap: "Overlap",
};
const ORDER: CheckKey[] = ["frame", "gps", "sunGlare", "exposure", "overlap"];

function Chip({ status }: { status: CheckStatus }) {
  return (
    <span className={"rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " + CHIP[status]}>
      {status}
    </span>
  );
}

/** Screening results in the mobile checklist stack: run summary, then file → status chip → reasons. */
export function ValidationResults({ report }: { report: ValidationReport }) {
  const { summary, files } = report;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-sm border border-datum-slate/30 bg-datum-cardbg p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">Screening Summary</span>
          <Chip status={summary.status} />
        </div>
        <div className="mt-2 flex items-center gap-3 font-mono text-[11px]">
          <span className="text-status-green">{summary.counts.PASS} PASS</span>
          <span className="text-tactical-goldmuted">{summary.counts.WARN} WARN</span>
          <span className="text-tactical-red">{summary.counts.FAIL} FAIL</span>
          <span className="ml-auto text-datum-slate">{summary.total} FRAMES</span>
        </div>
        {summary.notes.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 border-t border-datum-slate/20 pt-2">
            {summary.notes.map((n, i) => (
              <li key={i} className="font-mono text-[10px] leading-relaxed text-datum-slate">
                — {n}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {files.map((f) => {
          const flagged = ORDER.map((k) => [k, f.checks[k]] as const).filter(([, c]) => c.status !== "PASS");
          return (
            <li key={f.index} className="rounded-sm border border-datum-slate/25 bg-datum-cardbg/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-white">{f.name}</span>
                <Chip status={f.status} />
              </div>
              {flagged.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {flagged.map(([k, c]) => (
                    <li key={k} className="flex items-start gap-2">
                      <span className="mt-px shrink-0">
                        <Chip status={c.status} />
                      </span>
                      <span className="font-mono text-[10px] leading-relaxed text-datum-slate">
                        <span className="text-white/70">{CHECK_LABEL[k]}:</span> {c.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 font-mono text-[10px] text-datum-slate">All checks passed.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
