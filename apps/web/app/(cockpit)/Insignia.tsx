/**
 * Datum Zero insignia (Brand Guide §1): the Zero capsule (datum-zero glyph), the horizontal axis
 * line (the reference datum), and the benchmark chevron (surveyor's mark keyed to the axis — the
 * single gold emphasis). Replaces the text-only wordmark's decorative slot. Pure SVG, currentColor-
 * free so it inherits the brand tokens; decorative, so aria-hidden.
 */
export function Insignia({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* horizontal axis line — the reference datum */}
      <line x1="1.5" y1="18" x2="34.5" y2="18" stroke="var(--color-datum-slate)" strokeWidth="1.25" />
      {/* Zero capsule — the datum-zero glyph */}
      <rect x="11" y="4.5" width="14" height="27" rx="7" stroke="#ffffff" strokeWidth="2.1" />
      {/* benchmark chevron — surveyor's mark keyed to the axis (gold emphasis only) */}
      <path
        d="M13.6 27 L18 22.4 L22.4 27"
        stroke="var(--color-tactical-gold)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
