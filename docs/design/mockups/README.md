# Hi-fi mockups — the compositional target

Two validated hi-fi mockups back `docs/DESIGN-SYSTEM.md`. Drop the image files here:

| File | What it shows |
|---|---|
| `cockpit-queue.png` | The Manual QA Validation Queue — sidebar, command bar, three-column card composition |
| `website-marketing.png` | The marketing site (**not built** — separate track, gated on the CR-18 content session) |

> Claude Code cannot save images pasted into a chat to disk — it receives the rendered view, not the
> file bytes. The files are added here by hand.

## ⚠ The mockups are PRE-CORRECTION — build the composition, not the copy

They predate several locked CRs and show posture we have since ruled out. **Read them for layout,
elevation, and density only.** The following appear in the mockups and are FORBIDDEN in the product
(M3-1 posture rule; CR-18 reconciliation):

| In the mockup | Why it is forbidden | Build instead |
|---|---|---|
| "We **enforce** contractual compliance", "CONTRACTUAL TOLERANCE **ENFORCEMENT**" | We report measurements + recommendations; the client adjudicates | Evidence & recommendation (CR-12) |
| "**DYNAMIC LIABILITY BINDING** (ZSM **Thimble**)" | We never bind, collect, or resell insurance | Referral-only / SkyWatch (CR-01, CR-03) |
| "**FAA Remote ID validation**" | No live Remote-ID or in-browser NDAA attestation | Serial-match against the verified airframe registry; `isNdaaVerified = false` by default (CR-11) |
| "breaches your predefined contractual thresholds" | Verdict language | Measurement + "review recommended" (CR-12) |
| **Jira Cloud** as the destination system | Jira is not the primary target | MaintainX / UpKeep / Maximo + the generic webhook (CR-05, CR-14) |

The verdict/posture guard (`tests/guardrails/`) fails the build on this copy — that is intentional.

## Known mockup artifacts — ignore, do not reproduce

- **Garbled placeholder text.** The mockups are renders; much of their microcopy is noise:
  `Camƀtos`, `SADL`, `Masual Hotspot`, `oolidanc`, `Issue apjoud`, `MARGINE LOSS SUMMARY`,
  `Zero trash valldaior`. None of it is real copy.
- **Nav labels are placeholder.** Keep the real route taxonomy (Dashboard, Validation Queue, RuleSet
  Policy, Integrations, Asset Registry, Users, Admin).
- **Duplicate fields.** The Asset Info card shows "Anomaly Type" three times.
- **`+18.4°C` printed twice** on the thermal crop (top and bottom).
- **`Settings` appears twice** in the sidebar (mid-nav and bottom).
- **Stock avatar photo** on the assignee — we do not ship stock photography.

## What M3-1 took from the cockpit mockup

- **The elevation read.** Canvas ≈ `#131a29`, cards ≈ `#1f2a3d` — i.e. cards are LIGHTER than the
  stage. This confirmed the token roles were inverted in code and settled the fix: no Brand Guide hex
  changed, only which surface each paints. See DESIGN-SYSTEM.md §Elevation.
- **The card treatment.** Uppercase header bar + rule, 1px border, labelled inset field boxes with
  mono values — now `<Card>` / `<Field>`.
- **Sidebar.** Per-item icons, lifted active row with a gold accent, identity + log out pinned bottom.
- **Deferred to later M3 tickets:** the dual-viewport slider and Mapbox inset (M3-5), the three-column
  queue composition (M3-2), dashboard content (M3-3).
