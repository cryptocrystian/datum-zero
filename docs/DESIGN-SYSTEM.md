# Datum Zero — Design System (canonical)

Source: **Datum Zero Brand Guide v1.0.0** + the two validated hi-fi mockups. This is the single
reference for all UI. The `datum-zero-design` skill enforces it; `CLAUDE.md` points here for any
frontend work. Target stack: **Next.js 15 + Tailwind CSS v4 + Radix UI + Mapbox GL JS**.

## Aesthetic north star
Industrial dark mode. "Structural precision, mathematical ground truth, defense-grade data security."
**Explicitly rejects** consumer-SaaS pastels and white-on-white. Dark institutional navy canvas, muted
cadmium-gold used *sparingly* for emphasis only, monospace for all data, uppercase tracked labels,
sharp/minimal radii, bracketed `[ ACTION ]` motif for primary controls, subtle blueprint-grid texture.

## Elevation (M3-1, CR-38)
Four planes. **The canvas is the darkest surface; cards lift off it; fields are punched back down
into the card.** Every cockpit surface composes from `<Panel>/<Card>/<Field>`
(`apps/web/components/ui/elevation.tsx`) — do not hand-roll `bg-datum-cardbg border …` per page.

| Plane | Token | Hex | Role |
|---|---|---|---|
| 1 · canvas | `datum-midnight` | `#121926` | content stage — the darkest plane |
| 2 · panel | `datum-panel` | `#151926` | secondary/subdued surface |
| 3 · card | `datum-cardbg` | `#1A253A` | **lifted** — always with a 1px border + uppercase header bar |
| 4 · inset | `datum-darknavy` | `#121926` | field box inside a card; also the sidebar rail |

The ramp is deliberately narrow (≈1.15:1 canvas→card) — this is industrial dark mode, not a shadowed
material stack. **The 1px border does the defining work**, which is why `<Card>` always carries one.

> **History — the inversion.** Through M2 these hexes were assigned backwards: the canvas was
> `#1A253A` (the *lightest* surface) and cards were `#151926`, i.e. **darker than the stage they sat
> on**. Cards receded instead of lifting, at 1.14:1 against the canvas and 1.01:1 against the sidebar
> (1.00 = invisible). That — not a missing component pass — is what read as "flat". **No Brand Guide
> hex changed in the fix; only which surface each one paints.** `tests/guardrails/test_elevation.py`
> now parses these values and asserts the ordering by computed luminance, so it cannot silently
> invert again.

## Color tokens
| Token | Hex | Use |
|---|---|---|
| `datum-midnight` | `#121926` | content stage / global canvas (plane 1 — darkest) |
| `datum-panel` | `#151926` | secondary surface (plane 2) |
| `datum-cardbg` | `#1A253A` | content cards / elevated panels (plane 3 — lifted) |
| `datum-darknavy` | `#121926` | inset field box, sidebar rail, disabled input bg (plane 4) |
| `datum-slate` | `#6D7278` | borders, crosshairs, idle states, secondary text |
| `datum-charcoal` | `#2E2E2E` | deep dividers |
| `tactical-gold` | `#E9D700` | high-level emphasis, active focal markers, calculated anomalies |
| `tactical-goldmuted` | `#C49F30` | secondary gold / hover |
| `tactical-red` | `#8A2424` | rejected logs, out-of-spec variances, critical failures |
| status green | (OK indicator) | `System Status: OK`, node-activity toggle — success only |

### Tailwind v4 tokens — paste into `apps/web/app/globals.css`
```css
@import "tailwindcss";

@theme {
  /* Elevation ramp — canvas is DARKEST, card is LIFTED. See §Elevation before changing these. */
  --color-datum-midnight: #121926; /* 1. canvas */
  --color-datum-panel:    #151926; /* 2. panel  */
  --color-datum-cardbg:   #1A253A; /* 3. card (lifted) */
  --color-datum-darknavy: #121926; /* 4. inset field / sidebar rail */
  --color-datum-slate:    #6D7278;
  --color-datum-charcoal: #2E2E2E;
  --color-tactical-gold:      #E9D700;
  --color-tactical-goldmuted: #C49F30;
  --color-tactical-red:       #8A2424;

  --font-sans: "Vertex Sans", "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Datum Mono", "JetBrains Mono", ui-monospace, monospace;
}
```
This yields `bg-datum-midnight`, `text-tactical-gold`, `border-datum-slate`, `font-mono`, etc.

## Typography
- **Interface — Vertex Sans / Inter:** geometric, high-legibility, wide tracking. Headers are
  **uppercase, tracking-wide, bold**.
- **Data — Datum Mono / JetBrains Mono:** tabular, slashed zero. Use for **all** coordinates, IDs,
  radiometric values, confidences, and JSON payloads.
- **Practical note:** implement with **Inter** + **JetBrains Mono** (both free) unless licensed Vertex
  Sans / Datum Mono files are provided — they're the specified fallbacks and are production-ready.

Type scale: H1 24/32 · H2 16/24 · H3 (label) 12/16 (uppercase) · mono coords 14/20 · mono payload 12/18.

## Layout
- **Sidebar:** 260px fixed, `bg-datum-darknavy`; insignia + routes (`/dashboard`, `/queue`,
  `/integrations`, …) + a live `System Status: OK` health capsule.
- **Content stage:** `calc(100vw - 260px)`, `bg-datum-midnight`, `p-6` (24px uniform).
- **Grid:** strict 12-column flex matrix.
- **Validation Queue (`/queue`):** Pane A "Reality Viewport" 55% (dual RGB|thermal slider,
  `cursor-col-resize`, + 240px Mapbox coordinate inset with concentric-ring target); Pane B
  "Operational Routing Console" 45% (asset param stack in disabled inputs, target-system selector,
  dispatch/reject action group).

## Component patterns
- **Cards:** use `<Card title="…">` — `bg-datum-cardbg` (lifted), 1px `border-datum-slate/30`, small
  radius, uppercase header bar. Do not hand-roll; see §Elevation.
- **Data fields:** use `<Field label="…">` — an inset box, `bg-datum-darknavy border-datum-slate/30`,
  mono value, uppercase slate micro-label.
- **Primary / dispatch button:** `bg-datum-midnight hover:bg-tactical-gold text-white border border-tactical-gold transition-colors duration-150`, bracketed label `[ DISPATCH TICKET ]`.
- **Destructive / reject:** `bg-transparent hover:bg-tactical-red text-tactical-red hover:text-white border border-tactical-red`, `[ REJECT ]`.
- Build interactive primitives on **Radix UI**; maps on **Mapbox GL JS** (dark vector style).

## Serialization standards (enforce in UI *and* the work-order payload)
- **Coordinates:** fixed 6-decimal `±DD.DDDDDD` (e.g. `LAT: 40.712700 | LON: -74.005900`). Matches
  schema `Decimal(9,6)` and CR-13.
- **Asset strings (canonical — CR-17):** `[SITE_ID]-[ARRAY_ID]-[ROW_ID]-[STRING_ID]-[NODE_ID]`,
  e.g. `APEX_SOLAR-GRID_04-ROW_12-STR_08-MOD_14`.
- **Confidence:** one decimal, `96.8%`. **Thermal variance:** `+ΔT°C … vs. median` (e.g.
  `+18.4°C delta vs. median`).

## Responsive tiers
≥1440px full 3-column dashboard · ≤1024px sidebar → icon rail, routing console stacks under viewport ·
≤640px single-column, full-screen crops, checklist stack.

## Drift guardrails (the anti-AI-sterile rules)
Dark canvas, never white. Gold is for emphasis **only** — never fill large areas. Mono for every
number/ID/coordinate. Uppercase, tracked labels. Sharp corners, minimal radius. Bracketed action
labels. Real product terms — **never** the garbled placeholder text from the mockups.

---

## Decisions this introduces (append to `docs/PRD-Corrections-Log.md`)

**CR-17 — Canonical asset-label standard ✅**
Adopt the Brand Guide §5 asset serialization `[SITE_ID]-[ARRAY_ID]-[ROW_ID]-[STRING_ID]-[NODE_ID]`
(e.g. `APEX_SOLAR-GRID_04-ROW_12-STR_08-MOD_14`) as the canonical `Asset.internalLabel` format. Update
the seed to emit this pattern. Rationale: one consistent, node-resolvable identity spine across UI,
payload, and registry (CR-13).
**SITE_ID vs. tenant:** `SITE_ID` names a *physical site/project* (e.g. `APEX_SOLAR`) and is distinct
from the tenant/`Organization` — the O&M operator (e.g. "Lighthouse Solar O&M"). One operator manages
many named sites; the cockpit site selector switches among them. The seed's org name and the asset
`SITE_ID` are intentionally different, and that is correct.

**CR-18 — Marketing copy must honor the product's locked posture 🔎**
The current marketing mockup contradicts locked decisions and must be corrected before any marketing
build: (a) replace "Dynamic Liability Binding ($2M Thimble)" with referral/verification framing —
SkyWatch, variable required limit (CR-01/02/03); (b) remove autonomous-enforcement language
("we enforce contractual compliance," "instantly pushes") in favor of "surfaces contractual-grade
evidence for your team to action" — the platform never adjudicates (CR-12). The **cockpit** mockup is
compliant (Manual QA queue + human Dispatch/Reject); the **marketing** copy is not.
