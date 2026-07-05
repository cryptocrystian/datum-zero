---
name: datum-zero-design
description: >
  Design system + UI/UX standards for Datum Zero Systems. ALWAYS use when building ANY Datum Zero
  frontend — the cockpit (QA queue, dashboard, integrations, admin), the Infield Validator PWA, the
  marketing site, or the PDF field-dispatch output. Enforces the industrial-dark-mode brand (navy
  canvas, cadmium-gold emphasis, Vertex Sans/Datum Mono, 260px sidebar, bracketed actions) and blocks
  the generic, white-on-white, AI-sterile defaults. Full reference: docs/DESIGN-SYSTEM.md. Trigger on
  any work under apps/web, any .tsx/.css UI file, or mentions of cockpit, queue, dashboard, PWA, or
  marketing UI.
---

# Datum Zero — Design Skill

> Install: **Settings → Capabilities** or `.claude/skills/datum-zero-design/SKILL.md`.
> Canonical detail + tokens: `docs/DESIGN-SYSTEM.md`. Aesthetic north star: industrial dark mode —
> structural precision, defense-grade. **Reject consumer-SaaS pastels and white-on-white.**

## Non-negotiables (reject the UI on review if violated)
1. **Dark canvas, never white.** `bg-datum-midnight` stage, `bg-datum-darknavy` sidebar,
   `bg-datum-cardbg` panels. Gold (`tactical-gold #E9D700`) is **emphasis only** — never large fills.
2. **Monospace for all data.** Every coordinate, asset ID, confidence, radiometric value, and JSON
   payload uses `font-mono` (Datum Mono / JetBrains Mono, slashed zero).
3. **Uppercase, tracking-wide headers/labels** in Vertex Sans / Inter.
4. **Serialization exactness:** coords `±DD.DDDDDD` (6dp); asset labels
   `[SITE_ID]-[ARRAY_ID]-[ROW_ID]-[STRING_ID]-[NODE_ID]` (CR-17); confidence one-decimal `96.8%`;
   thermal `+ΔT°C … vs. median`.
5. **Bracketed primary actions:** `[ DISPATCH TICKET ]`, `[ REJECT ]` (button specs in DESIGN-SYSTEM.md).
6. **Evidence, not verdict — in UI copy too (CR-12).** No "violation/breach/back-charge/enforce" in
   product UI; surface measurements + "review recommended." The QA queue is a *manual* human gate.
7. **Layout:** 260px fixed sidebar; content `p-6`; 12-column grid; `/queue` = 55% reality viewport
   (dual RGB|thermal slider + Mapbox inset) / 45% routing console.

## Stack
Next.js 15 (App Router) · Tailwind v4 (tokens via `@theme`, see DESIGN-SYSTEM.md) · Radix UI primitives
· Mapbox GL JS (dark vector). Fonts: Inter + JetBrains Mono unless licensed Vertex/Datum files exist.

## Anti-patterns (reject on sight)
White/light backgrounds · large gold fills · sans-serif numbers/coordinates · title-case data labels ·
rounded/pill buttons · verdict language in copy · the mockups' garbled placeholder text taken literally.
