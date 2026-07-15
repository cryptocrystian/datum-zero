/**
 * M3-1 / CR-38 — the elevation component set (docs/DESIGN-SYSTEM.md §Elevation).
 *
 * Four planes, darkest to lifted:
 *
 *   canvas  (datum-midnight)  the content stage — set once by the cockpit layout
 *   panel   (datum-panel)     secondary/subdued surface
 *   card    (datum-cardbg)    LIFTED, always with a 1px border + uppercase header bar
 *   inset   (datum-darknavy)  a field box punched back down INTO a card
 *
 * Every surface in the cockpit composes from these three components rather than hand-rolling
 * `bg-datum-cardbg border ...` per page — that is how the elevation stays consistent as pages get
 * rebuilt (M3-2/M3-3). Token-driven only: no hex literal may appear here (guardrail-enforced).
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
    <section className={cx("rounded-sm border border-datum-slate/20 bg-datum-panel", className)}>
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
        // The 1px border is what defines the lift — the ramp is deliberately subtle, so the card
        // never relies on fill alone to separate from the canvas.
        "rounded-sm border border-datum-slate/30 bg-datum-cardbg shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_2px_8px_-2px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-datum-slate/25 px-4 py-2.5">
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
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-datum-slate">{label}</span>
      <div
        className={cx(
          "rounded-sm border border-datum-slate/30 bg-datum-darknavy px-3 py-2 text-sm text-white",
          mono && "font-mono",
        )}
      >
        {children ?? value}
      </div>
    </div>
  );
}
