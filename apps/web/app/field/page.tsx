import { getSession } from "@/lib/session";
import { Insignia } from "../(cockpit)/Insignia";
import { FileIntake } from "./FileIntake";

// Always reflect the live session; nothing here is cached.
export const dynamic = "force-dynamic";

/**
 * Infield Validator — field surface (M1-04, CR-11).
 *
 * An on-site DATA-INTEGRITY + HARDWARE-SCREENING tool: it stages a capture set for validation. It
 * does NOT adjudicate outcomes (CR-12), and it makes no airframe-compliance or live-broadcast
 * claims — hardware verification is a server-side registry serial-match (CR-11). The full Validator
 * arc is live (M1-04 shell + intake, M1-05 client validation, M1-06 hardware screening + fail-closed upload).
 */
export default async function FieldPage() {
  const session = await getSession();
  const pilot = session?.name ?? session?.email ?? "Field Pilot";

  // The full field sequence — all live. 01 is the entry on this screen; 02–04 run automatically on
  // submit: client integrity screen (M1-05) → airframe serial-match (M1-06) → fail-closed hand-off.
  const steps = [
    { n: "01", label: "Stage Capture Set", current: true },
    { n: "02", label: "Screen Capture Integrity", current: false },
    { n: "03", label: "Screen Airframe Hardware", current: false },
    { n: "04", label: "Hand Off to Validation", current: false },
  ];

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-6 px-4 pb-10 pt-5">
      <header className="flex flex-col gap-3 border-b border-datum-slate/25 pb-4">
        <div className="flex items-center gap-3">
          <Insignia className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold uppercase tracking-[0.12em] text-white">Infield Validator</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">
              On-site data-integrity + hardware screening
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-sm border border-datum-slate/30 bg-datum-cardbg px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-status-green shadow-[0_0_6px_var(--color-status-green)]" />
            <span className="font-mono text-[11px] text-white">{pilot}</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">Pilot</span>
        </div>
      </header>

      {/* Checklist stack — the field diagnostic sequence. 01 is the entry; 02–04 run automatically. */}
      <ol className="flex flex-col gap-2">
        {steps.map((s) => (
          <li
            key={s.n}
            className={
              "flex items-center gap-3 rounded-sm border px-3 py-2.5 " +
              (s.current
                ? "border-tactical-gold/60 bg-datum-cardbg"
                : "border-datum-slate/25 bg-datum-cardbg/40")
            }
          >
            <span
              className={
                "font-mono text-xs " + (s.current ? "text-tactical-gold" : "text-datum-slate")
              }
            >
              {s.n}
            </span>
            <span
              className={
                "font-mono text-[12px] uppercase tracking-wider " +
                (s.current ? "text-white" : "text-white/70")
              }
            >
              {s.label}
            </span>
            {!s.current ? (
              <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-datum-slate/60">
                Auto
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {/* Step 01 — stage a capture set (client-side intake; metadata only, no upload). */}
      <section className="flex flex-col gap-3 rounded-sm border border-datum-slate/30 bg-datum-cardbg p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-datum-slate">01 · Stage Capture Set</h2>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-datum-slate">
          Select the on-device folder or files from today&apos;s flight. Files stay on this device —
          nothing is uploaded from this screen.
        </p>
        <FileIntake />
      </section>

      <footer className="mt-auto border-t border-datum-slate/20 pt-4 font-mono text-[10px] leading-relaxed text-datum-slate">
        Field screening tool · measurements + screening only. Datum Zero surfaces evidence; it does
        not issue verdicts (CR-12).
      </footer>
    </main>
  );
}
