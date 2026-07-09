import type { UnsupportedFormatDTO } from "@/lib/quality/reason";
import { unsupportedFormatLabel } from "@/lib/quality/reason";

/**
 * Unsupported capture formats (M2-1f, CR-11/CR-22) — the DEMAND SIGNAL for decoder work. Counts of
 * UNKNOWN_FORMAT capture-quality events grouped by manufacturer / model / format fingerprint,
 * org-scoped, most-frequent first. Distinct from the per-session CaptureQualityStrip: this ranks the
 * decoder long tail so a new decoder is built on measured evidence, not speculation (CR-14). It is a
 * count of REJECTED captures — evidence-framed, never a verdict, never dispatchable.
 *
 * Tie-in (NOT built here): M2-3's onboarding airframe→core→decoder pre-map consumes this signal.
 */
export function UnsupportedFormats({ groups }: { groups: UnsupportedFormatDTO[] }) {
  const total = groups.reduce((n, g) => n + g.count, 0);
  return (
    <section className="overflow-hidden rounded-sm border border-datum-slate/30 bg-datum-cardbg">
      <div className="flex items-center justify-between border-b border-datum-slate/25 bg-datum-darknavy/60 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">
          Unsupported capture formats — decoder backlog (by frequency)
        </span>
        <span className="font-mono text-[10px] text-tactical-gold">{String(total).padStart(2, "0")}</span>
      </div>

      {groups.length === 0 ? (
        <div className="px-3 py-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-datum-slate">
            No unsupported formats seen — every capture routed to a decoder.
          </span>
        </div>
      ) : (
        <ul>
          {groups.map((g, i) => (
            <li
              key={`${g.manufacturer ?? "?"}|${g.model ?? "?"}|${g.formatFingerprint ?? "?"}`}
              className="flex items-center justify-between gap-3 border-b border-datum-slate/15 px-3 py-2 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="font-mono text-[10px] text-datum-slate/70">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate text-sm text-white/90">{unsupportedFormatLabel(g)}</span>
              </div>
              <span className="shrink-0 font-mono text-sm text-tactical-gold">{g.count}×</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
