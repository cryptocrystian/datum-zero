# Datum Zero — Design System (canonical, tiered)

**v2.0.0 · one brand, two settings.** This is the single design authority for all surfaces.

> **Supersedes:**
> - the **monolithic gold spec** (v1.x) — it applied one surface's rules globally, which is what
>   fractured the system: the cockpit inherited marketing-weight gold it should never have had.
> - the **"Cyber Cyan" 1.2.0-unified** doc (`#00F0FF`, glassmorphism, Cosmic Void `#060913`) —
>   reviewed and **disregarded**. No cyan, no glassmorphism, no neon glow anywhere.
>
> Structure: **`brand.*`** (shared DNA) → **`app.*`** (Tactical HUD) + **`marketing.*`** (Enterprise).
> A rule lives at the highest tier that is true for every surface below it. When `app` and `marketing`
> disagree, that is by design — they are two settings of one brand, not two brands.

**Authorities.** `app.*` is derived from `docs/design/mockups/Dashboard mockup.png`, **sampled
programmatically** (Pillow, patch-median — never eyeballed). `marketing.*` is derived from
`docs/design/mockups/website mockup.png`. Enforced by `skills/datum-zero-design/SKILL.md` (kept in
lockstep with this file) and `tests/guardrails/test_elevation.py`.

---

## 1 · `brand.*` — the shared DNA

True of every surface.

| Element | Value |
|---|---|
| Base family | Deep navy, institutional, dark-mode only. **Never a light canvas.** |
| **Signature accent** | **Gold `#E9D700`** (`brand-gold`) — carried by the **insignia** and the **marketing site**. |
| Interface type | **Inter** (Vertex Sans fallback) — uppercase, tracked, bold for headers |
| Data type | **JetBrains Mono** (Datum Mono fallback), slashed zero, tabular |
| Texture | Blueprint grid — engineering paper under the content, never noise |
| Insignia | Zero capsule + reference-datum axis + **gold** benchmark chevron |
| Geometry | Sharp, structural, minimal radii. No pills, no glassmorphism, no glow. |
| Voice | **Evidence, not verdict (CR-12).** Measurements + "review recommended". Never `violation`, `breach`, `back-charge`, `penalty`, `liable`, `enforce`. |

### Where gold lives — read this before adding gold
Gold is the **brand through-line**, carried by the **insignia** (present on every surface) and the
**marketing site**. It is *not* a general-purpose UI accent.

**The app mockup contains zero gold.** This was verified programmatically, not by eye: a hue/saturation
scan of `Dashboard mockup.png` outside the photographic regions returns **0 gold pixels**. (An earlier
scan reported ~600 "gold" hits — those were the *thermal plume* in the radiometric crop, not UI.) The
app's emphasis is carried by **functional colour**, not brand colour. See §2.

---

## 2 · `app.*` — Tactical HUD (cockpit + field PWA)

Applies to `apps/web/app/(cockpit)/*` and `apps/web/app/field/*`.

The read is a **precision instrument panel**: gray instrument cards on a navy stage, functional
colour-coding, mono data, high density. **This vibe is inviolable.**

### 2.1 Palette — SAMPLED from `Dashboard mockup.png`

| Token | Hex | Role |
|---|---|---|
| `app-canvas` | `#1c2739` | the stage — navy |
| `app-panel` | `#232a35` | secondary surface between canvas and card |
| `app-card` | `#2f2e33` | **the instrument card — neutral GRAY, not navy** |
| `app-card-header` | `#3e454f` | card header band — notably lighter than the card |
| `app-inset` | `#1b1b1c` | field box — near-black, punched into the card |
| `app-nav-active` | `#162137` | active sidebar row — navy |
| `app-action-steel` | `#4f647b` | `[ DISPATCH TICKET ]` fill |
| `app-line` | `#6d7278` | borders, hairline rules, idle, secondary text |

> **Cards are gray, the canvas is navy.** That contrast — a neutral instrument surface floating on a
> navy stage — is a large part of the tactical read. Do not "correct" the cards back to navy.

### 2.2 Depth — where it actually comes from

Measured on the mockup:

| Step | Ratio | |
|---|---|---|
| canvas → card | **1.115:1** | nearly nothing |
| card → header band | **1.391:1** | ← |
| card → inset field | **1.278:1** | ← |

**The depth is the header band + inset boxes INSIDE the card — ~2.5× the canvas→card step.** The fill
ramp is not the lever.

> **Do not widen canvas→card.** M3-1 shipped a 1.148:1 navy ramp (CR-38) — already *wider* than the
> mockup — and the cockpit still read flat, because `<Card>`/`<Field>` were wired to nothing. Widening
> the ramp moves *away* from the mockup. **Wire the components in instead.**

Compose every surface from `apps/web/components/ui/elevation.tsx` — `<Panel>` / `<Card title>` /
`<Field label value>`. **Never hand-roll `bg-app-card border …` on a page.**

### 2.3 Functional colour — meaning, not decoration

In the app, colour is **operational state**. It is never brand expression.

| Colour | Token | Meaning |
|---|---|---|
| Green | `status-green` | nominal · System Status: OK · node activity |
| Steel blue | `app-action-steel` | the primary action (`[ DISPATCH TICKET ]`) |
| Red | `tactical-red` | reject · critical |
| Amber / Orange / Red | `iec-cat1` / `iec-cat2` / `iec-cat3` | IEC TS 62446-3 severity (Cat 1/2/3) |

### 2.4 Gold in the app — focus ring only, A/B toggleable

The app follows its zero-gold mockup. The **single** permitted exception is the **focus/selection
ring**, behind one token so the decision is a one-line flip:

```css
--color-app-focus: var(--color-brand-gold); /* B — scarce gold focus accent (current) */
/* --color-app-focus: var(--color-app-line);   A — neutral ring, zero app gold */
```

**Forbidden in-app** (this is the rejected option C — it departs from the mockup and breaks the
tactical read): gold on **nav**, on **ΔT / key metrics**, on the **primary action**, and **any** gold
fill. The active nav row is navy (`app-nav-active`); ΔT is white mono; the action is steel.

### 2.5 Components

- **Card** — `bg-app-card`, 1px `app-line/30` border, **header bar + hairline rule**, dense body.
- **Field** — uppercase slate micro-label + **inset box** (`bg-app-inset`), mono value.
- **Primary action** — bracketed `[ DISPATCH TICKET ]`, steel fill.
- **Destructive** — `[ REJECT ]`, red outline, transparent fill.
- **Data** — mono for every coordinate, asset ID, confidence, radiometric value, payload.

### 2.6 Serialization exactness
Coords `±DD.DDDDDD` (6dp) · asset labels `[SITE]-[ARRAY]-[ROW]-[STRING]-[NODE]` (CR-17) · confidence
one decimal (`96.8%`) · thermal `+ΔT°C … vs. median`.

### 2.7 Layout
260px fixed sidebar (insignia · **Overview** · Validation Queue · RuleSet Policy · Integrations · Asset
Registry · Users · Admin) · top command bar (site selector · System Status · Node Activity) · content
stage `p-6` · 12-column grid.

> The cockpit nav says **Overview**, never "Dashboard" — it is an admin overview, never the forbidden
> technician-facing operational dashboard (CR-06).

---

## 3 · `marketing.*` — Enterprise polish (DEFINED, NOT BUILT)

Derived from `website mockup.png`. **Documented here so the tier exists; building is gated on the
CR-18 content session.** Do not build marketing surfaces from this ticket.

| Element | Direction |
|---|---|
| Density | Spacious — generous whitespace, expansive sections (the inverse of `app`) |
| **Gold** | **Hero accent** — CTAs (`[ REQUEST PAID PROOF OF VALUE ]`), headline metrics, rules |
| Type | Large bold sans headlines; mono reserved for proof-points and figures |
| Depth | Gradients over navy permitted (never in `app`) |
| Voice | Evidence-framed (CR-12) — the mockup's pre-correction copy is **not** the target |

> The website mockup is **pre-correction**: it shows "we enforce contractual compliance", "DYNAMIC
> LIABILITY BINDING (Thimble)", "FAA Remote ID validation", and Jira-as-target. All are forbidden.
> See `docs/design/mockups/README.md`.

---

## 4 · Anti-patterns — reject on sight
White/light canvas · **navy cards** (they are gray) · **gold fills** · gold on nav/ΔT/action · cyan ·
glassmorphism · neon glow · sans-serif numbers · title-case data labels · pill buttons · verdict
language · the mockups' garbled placeholder copy taken literally · hand-rolled cards bypassing
`<Card>`.
