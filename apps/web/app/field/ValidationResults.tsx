"use client";

import type { CheckKey, CheckResult, CheckStatus, HardwareCheckKey, ValidationReport } from "@/lib/field/validation";
import type { UploadItem, UploadStatus } from "./useFieldUpload";

const CHIP: Record<CheckStatus, string> = {
  PASS: "border-status-green/40 text-status-green",
  WARN: "border-tactical-goldmuted/50 text-tactical-goldmuted",
  FAIL: "border-tactical-red/60 text-tactical-red",
};

const UPLOAD_CHIP: Record<UploadStatus, string> = {
  INGESTED: "border-status-green/40 text-status-green",
  UPLOADING: "border-tactical-goldmuted/50 text-tactical-goldmuted",
  REJECTED: "border-tactical-red/60 text-tactical-red",
  ERROR: "border-tactical-red/60 text-tactical-red",
  SKIPPED: "border-datum-slate/50 text-datum-slate",
};

const QUALITY: { key: CheckKey; label: string }[] = [
  { key: "frame", label: "Frame" },
  { key: "gps", label: "GPS" },
  { key: "gpsIntegrity", label: "GPS Δ" },
  { key: "sunGlare", label: "Sun" },
  { key: "glare", label: "Glare" },
  { key: "exposure", label: "Exposure" },
  { key: "overlap", label: "Overlap" },
];
const HARDWARE: { key: HardwareCheckKey; label: string }[] = [
  { key: "ndaa", label: "NDAA (heuristic)" },
  { key: "airframe", label: "Airframe" },
];

function Chip({ status }: { status: CheckStatus }) {
  return (
    <span className={"rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " + CHIP[status]}>
      {status}
    </span>
  );
}

/** Screening + upload results in the mobile checklist stack: summary, then file → chips → reasons. */
export function ValidationResults({
  report,
  uploads,
}: {
  report: ValidationReport;
  uploads?: Record<string, UploadItem>;
}) {
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
          <span className="ml-auto text-tactical-gold">{summary.eligible}/{summary.total} ELIGIBLE</span>
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
          const quality = QUALITY.map((q) => [q.label, f.checks[q.key]] as const);
          const hardware = f.hardware ? HARDWARE.map((h) => [h.label, f.hardware![h.key]] as const) : [];
          const flagged = [...quality, ...hardware].filter(([, c]) => c.status !== "PASS") as [string, CheckResult][];
          const up = uploads?.[f.name];
          return (
            <li key={f.index} className="rounded-sm border border-datum-slate/25 bg-datum-cardbg/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-white">{f.name}</span>
                {up ? (
                  <span className={"rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " + UPLOAD_CHIP[up.status]}>
                    {up.status}
                  </span>
                ) : null}
                <Chip status={f.status} />
              </div>
              {up && up.status !== "SKIPPED" ? (
                <p className="mt-1 font-mono text-[10px] text-datum-slate">{up.message}</p>
              ) : null}
              {flagged.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {flagged.map(([label, c]) => (
                    <li key={label} className="flex items-start gap-2">
                      <span className="mt-px shrink-0">
                        <Chip status={c.status} />
                      </span>
                      <span className="font-mono text-[10px] leading-relaxed text-datum-slate">
                        <span className="text-white/70">{label}:</span> {c.reason}
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
