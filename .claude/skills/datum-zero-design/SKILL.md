---
name: datum-zero-design
description: >
  Design system + UI/UX standards for Datum Zero Systems. ALWAYS use when building ANY Datum Zero
  frontend — the cockpit (QA queue, Overview, integrations, admin), the Infield Validator PWA, the
  marketing site, or the PDF field-dispatch output. Enforces the tiered v2 authority (CR-40): one
  brand, two settings — brand core (navy, gold signature, Inter/JetBrains Mono, insignia) → app
  (Tactical HUD: sampled gray instrument cards on a navy stage, functional colour, mono, dense, gold
  only as a focus ring) + marketing (spacious, gold-hero, defined-not-built). Blocks the generic,
  white-on-white, AI-sterile defaults. Full reference: docs/DESIGN-SYSTEM.md. Trigger on any work
  under apps/web, any .tsx/.css UI file, or mentions of cockpit, queue, Overview, PWA, or marketing UI.
---

# Datum Zero — Design Skill

> Canonical detail + tokens: **`docs/DESIGN-SYSTEM.md` (v2, tiered)**. This skill is its enforcement
> arm and is kept in lockstep with it. Aesthetic north star: industrial dark mode — structural
> precision, defense-grade. **Reject consumer-SaaS pastels and white-on-white.**

## The tiering — read this first (CR-40)
**One brand, two settings.** A rule lives at the highest tier true for every surface below it.

| Tier | Surface | Read |
|---|---|---|
| `brand.*` | everything | navy base · **gold `#E9D700` signature** · Inter + JetBrains Mono · blueprint grid · insignia · sharp geometry · evidence voice |
| `app.*` | cockpit + field PWA | **Tactical HUD** — gray instrument cards on a navy stage, functional colour, mono, dense |
| `marketing.*` | website | **Enterprise** — spacious, **gold-hero**, gradients. *Defined, NOT built* (gated on CR-18). |

**Superseded, do not resurrect:** the monolithic gold spec (one surface's rules applied globally —
that is what fractured the system) and the "Cyber Cyan" 1.2.0 doc (`#00F0FF`, glassmorphism).

## GOLD — the rule that gets broken most
Gold is the **brand through-line**, carried by the **insignia** (every surface) and the **marketing
site**. It is **not** a general-purpose UI accent.

- **`marketing.*`:** gold is the **hero accent** — CTAs, headline metrics, rules.
- **`app.*`:** the app mockup has **ZERO gold** (verified programmatically — an earlier "gold" reading
  was the *thermal plume* in the radiometric crop, not UI). The app's emphasis is **functional
  colour**. The **only** permitted in-app gold is the **focus/selection ring**, behind
  `--color-app-focus` so the A/B call is one line.
- 🚫 **Never in-app:** gold on **nav**, on **ΔT / key metrics**, on the **primary action**, or as
  **any fill**. (Evaluated and rejected — it departs from the mockup and breaks the tactical read.)

## `app.*` non-negotiables (reject the UI on review if violated)
1. **Sampled palette** (from `docs/design/mockups/Dashboard mockup.png` — never eyeball):
   canvas `#1c2739` (navy) · panel `#232a35` · **card `#2f2e33` (neutral GRAY, not navy)** ·
   header band `#3e454f` · inset `#1b1b1c` · nav-active `#162137` (navy) · action steel `#4f647b` ·
   line `#6d7278`.
2. **Cards are GRAY on a NAVY stage.** A navy card is a regression, not a nuance.
3. **Depth comes from INSIDE the card**, never the fill ramp: header band (1.391:1) + inset boxes
   (1.278:1) vs canvas→card (only **1.115:1**). 🚫 **Never widen canvas→card to chase depth** — a
   wider-than-mockup ramp already shipped once and the cockpit still read flat.
4. **Compose from `<Panel>` / `<Card title>` / `<Field label value>`** (`components/ui/elevation.tsx`).
   🚫 No hand-rolled `bg-app-card border …` on a page.
5. **Functional colour = operational meaning:** green `status-green` = nominal/OK · steel
   `app-action-steel` = primary action · red `tactical-red` = reject/critical · IEC severity
   `iec-cat1/2/3` (amber/orange/red) per IEC TS 62446-3.
6. **Monospace for all data.** Every coordinate, asset ID, confidence, radiometric value, payload
   (`font-mono`, slashed zero).
7. **Uppercase, tracking-wide headers/labels** in Inter (Vertex Sans fallback).
8. **Serialization exactness:** coords `±DD.DDDDDD` (6dp) · asset labels
   `[SITE_ID]-[ARRAY_ID]-[ROW_ID]-[STRING_ID]-[NODE_ID]` (CR-17) · confidence one-decimal `96.8%` ·
   thermal `+ΔT°C … vs. median`.
9. **Bracketed actions:** `[ DISPATCH TICKET ]` (steel fill) · `[ REJECT ]` (red outline).
10. **Evidence, not verdict (CR-12).** No "violation/breach/back-charge/penalty/liable/enforce" in
    product UI; surface measurements + "review recommended." The QA queue is a *manual* human gate.
11. **Layout:** 260px fixed sidebar (**Overview** — never "Dashboard"; it is an admin overview, never
    the forbidden technician-facing operational dashboard, CR-06) · content `p-6` · 12-column grid ·
    `/queue` = 55% reality viewport (dual RGB|thermal slider + Mapbox inset) / 45% routing console.

## Stack
Next.js 15 (App Router) · Tailwind v4 (tokens via `@theme`, see DESIGN-SYSTEM.md) · Radix UI primitives
· Mapbox GL JS (dark vector). Fonts: Inter + JetBrains Mono unless licensed Vertex/Datum files exist.

## Anti-patterns (reject on sight)
White/light backgrounds · **navy cards** · **gold fills** · gold on nav/ΔT/action · cyan ·
glassmorphism · neon glow · **widening canvas→card for "depth"** · sans-serif numbers/coordinates ·
title-case data labels · rounded/pill buttons · verdict language in copy · hand-rolled cards bypassing
`<Card>` · the mockups' garbled placeholder text (`Camƀtos`, `SADL`, `Masual Hotspot`) taken literally
· the website mockup's pre-correction copy ("enforce contractual compliance", "DYNAMIC LIABILITY
BINDING / Thimble", "FAA Remote ID validation", Jira-as-target — all forbidden; see
`docs/design/mockups/README.md`).
