/**
 * The elevation component set — M3-1/CR-38, retargeted to the sampled app.* palette by M3-1R/CR-40.
 * See docs/DESIGN-SYSTEM.md §2 (`app.*` — Tactical HUD).
 *
 * The planes, sampled from docs/design/mockups/Dashboard mockup.png:
 *
 *   app-canvas       #1c2739  the navy stage — set once by the cockpit layout
 *   app-panel        #232a35  secondary surface
 *   app-card         #2f2e33  the instrument card — neutral GRAY, not navy
 *   app-card-header  #3e454f  the header band — LIGHTER than the card
 *   app-inset        #1b1b1c  a field box punched back down INTO the card
 *
 * THE DEPTH IS IN HERE, not in the fill ramp. On the mockup, canvas->card is only 1.115:1, while
 * card->header is 1.391:1 and card->inset is 1.278:1 — the in-card treatment is ~2.5x the ramp.
 * M3-1 shipped a ramp WIDER than the mockup's and the cockpit still read flat, because these
 * components were wired to nothing. So: never widen the ramp to chase depth — adopt these.
 *
 * Token-driven only: no hex literal may appear here (guardrail-enforced).
 */
import type { ReactNode } from "react";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Plane 2 — a subdued region. Use to group related cards or to hold secondary content that should
 * sit above the canvas without competing with a real card.
 */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-sm border border-app-line/20 bg-app-panel", className)}>
      {children}
    </section>
  );
}

/**
 * Plane 3 — the lifted card. `title` renders the uppercase section header bar (the mockup's card
 * treatment); omit it for an unlabelled surface. `actions` sits opposite the title in the bar.
 */
export function Card({
  title,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cx(
        // Gray instrument surface on the navy stage. The fill step off the canvas is deliberately
        // narrow (1.115:1 in the mockup) — the header band below carries the depth.
        "overflow-hidden rounded-sm border border-app-line/30 bg-app-card shadow-[0_2px_8px_-2px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {title ? (
        // The header band: a LIGHTER plane + a hairline rule. This is the mockup's strongest depth
        // cue (1.391:1 against the card body) — not decoration.
        <header className="flex items-center justify-between gap-3 border-b border-app-line/30 bg-app-card-header px-4 py-2.5">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white">{title}</h2>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Plane 4 — a labelled inset field. The label is an uppercase slate micro-label; the value sits in
 * a darker box punched into the card.
 *
 * `mono` defaults to TRUE: every coordinate, asset ID, confidence, and radiometric value is data and
 * renders in Datum Mono (DESIGN-SYSTEM.md §Typography). Pass `mono={false}` only for prose.
 */
export function Field({
  label,
  value,
  children,
  mono = true,
  className = "",
}: {
  label: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-app-line">{label}</span>
      <div
        className={cx(
          // Punched INTO the card (1.278:1 darker) — the second half of the depth.
          "rounded-sm border border-app-line/25 bg-app-inset px-3 py-2 text-sm text-white",
          mono && "font-mono",
        )}
      >
        {children ?? value}
      </div>
    </div>
  );
}
