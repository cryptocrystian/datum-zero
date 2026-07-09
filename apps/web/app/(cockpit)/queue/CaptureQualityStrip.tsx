import type { CaptureQualityEventDTO } from "@/lib/quality/reason";

/**
 * Capture Quality strip (M2-1d, CR-11/CR-22/CR-25) — a DISTINCT, non-anomaly section of the queue.
 * These are REJECTED captures that produced no work order: a radiometric data-quality outcome, never
 * a PENDING_QA item, never dispatchable. Evidence-framed copy only (CR-12). Server-rendered from
 * org-scoped DTOs; the operator can now see WHY a capture yielded no anomaly.
 */
function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function stamp(iso: string): string {
  // Deterministic, locale-free (avoids server/client hydration drift): "YYYY-MM-DD HH:MMZ".
  return `${iso.slice(0, 16).replace("T", " ")}Z`;
}

function deviceLabel(e: CaptureQualityEventDTO): string | null {
  const parts = [e.manufacturer, e.model].filter((s): s is string => !!s);
  return parts.length ? parts.join(" ") : null;
}

export function CaptureQualityStrip({ events }: { events: CaptureQualityEventDTO[] }) {
  return (
    <section className="overflow-hidden rounded-sm border border-datum-slate/30 bg-datum-cardbg">
      <div className="flex items-center justify-between border-b border-datum-slate/25 bg-datum-darknavy/60 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">
          Capture Quality — rejected captures (no work order)
        </span>
        <span className="font-mono text-[10px] text-tactical-gold">
          {String(events.length).padStart(2, "0")}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="px-3 py-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-datum-slate">
            No capture-quality events — every capture carried a usable radiometric channel.
          </span>
        </div>
      ) : (
        <ul>
          {events.map((e) => {
            const device = deviceLabel(e);
            return (
              <li
                key={e.id}
                className="flex flex-col gap-1 border-b border-datum-slate/15 px-3 py-2 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-datum-slate">
                      Session {shortId(e.ingestionSessionId)}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-tactical-gold/80">
                      {e.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/90">{e.reason}</p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  {device && (
                    <div className="font-mono text-[10px] uppercase tracking-wider text-datum-slate">
                      {device}
                    </div>
                  )}
                  <div className="font-mono text-[10px] tracking-wider text-datum-slate/70">
                    {stamp(e.createdAt)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
