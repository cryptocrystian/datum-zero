import type { FailedSessionDTO } from "@/lib/ingestion/sessions";

/**
 * Processing Failures strip (M2-7/CR-36) — sessions whose inference FAILED after exhausting retries.
 * A capture must never vanish into the queue: these are surfaced so the operator can see + re-drive a
 * stuck capture. Evidence-framed, no verdict language (CR-12). Server-rendered from org-scoped DTOs.
 */
function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function stamp(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")}Z`;
}

export function ProcessingFailures({ sessions }: { sessions: FailedSessionDTO[] }) {
  return (
    <section className="overflow-hidden rounded-sm border border-datum-slate/30 bg-datum-cardbg">
      <div className="flex items-center justify-between border-b border-datum-slate/25 bg-datum-darknavy/60 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">
          Processing Failures — inference did not complete
        </span>
        <span className="font-mono text-[10px] text-tactical-red">
          {String(sessions.length).padStart(2, "0")}
        </span>
      </div>

      {sessions.length === 0 ? (
        <div className="px-3 py-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-datum-slate">
            No processing failures — every uploaded capture reached inference.
          </span>
        </div>
      ) : (
        <ul>
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-1 border-b border-datum-slate/15 px-3 py-2 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-datum-slate">
                    Session {shortId(s.id)}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-tactical-red/90">
                    {s.processingStatus}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/90">
                  Inference did not complete after retries — re-drive this capture.
                </p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <div className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wider text-datum-slate">
                  {s.rawStoragePath}
                </div>
                <div className="font-mono text-[10px] tracking-wider text-datum-slate/70">{stamp(s.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
