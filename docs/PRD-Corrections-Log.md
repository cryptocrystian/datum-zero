# Datum Zero — Decision Log (CR-01…CR-15)

The **"why"** behind `MANIFEST.md`. Every code decision inherits these; changing one is an amendment,
not an ad-hoc deviation. Status: ✅ decided · 🔎 open diligence.

| CR | Decision | Rationale |
|----|----------|-----------|
| **CR-01** ✅ | Insurance provider is **provider-agnostic**; **SkyWatch.AI** primary (not Thimble). | Thimble discontinued drone coverage 2023-03-24 — the PRD's Thimble bind flow targets a dead product. |
| **CR-02** ✅ | Coverage limit is a **variable required profile**, not a hardcoded $2M; must be dedicated aviation + COI + additional insured. | Utilities/O&G/critical-infra require $5M–$25M; ~70% of target book sits there. $2M would fail procurement. |
| **CR-03** ✅ | Insurance is **referral-only** — verify, never bind/collect/white-label. | Founder decision: risk mitigation, not a revenue line or support burden. Removes Stripe premium-split. |
| **CR-04** 🔎 | Embedded referral model (insurer = seller of record); confirm with counsel. | Avoid insurance-producer licensing; "facilitate the bind, don't become the broker." |
| **CR-05** ✅ | Build the **routing abstraction** now; implement adapters on demand. | Preserves the "plugs into your stack" moat without 7 brittle enterprise integrations pre-traction. |
| **CR-06** ✅ | **Headless at the edge, thin cockpit inside**; v1 human-in-the-loop QA. | `PENDING_QA` proves a UI is needed; "headless" is about output, not absence of UI. |
| **CR-07** ✅ | Beachhead = **solar thermal**. | Highest core-app weighting, tractable CV, crisp standards, standardized taxonomy, fewest integrations. |
| **CR-08** ✅ | Marketplace capability live at launch; **automation concierged first**. | Competitive equalizer vs. captive networks, without front-loading the FinTech state machine. |
| **CR-09** ✅ | Name **both**: Datum Zero AI (once/pilot) + **client AI via blanket endorsement** (auto). Requirement is a profile (limit + dedicated aviation + AI + P&NC + waiver of subrogation). | Enterprise clients demand AI on the flyer's policy; blanket AI removes per-job friction; platform can't be sole AI. |
| **CR-10** ✅ | **Buy** COI verification (TrustLayer/Certificial) + provider API for on-demand; re-verify before window; **fail closed**. | A COI is a stale snapshot; don't build parsing. |
| **CR-11** ✅ | Validator = **data-integrity firewall** (keep, client-side). NDAA → **verified airframe registry** + capture-time serial match. Remote ID → telemetry serial, **not** live broadcast. | Browsers can't receive Remote ID beacons; EXIF is spoofable. Registry is a stronger, auditable moat. |
| **CR-12** ✅ | **Evidence engine, not judge.** Client adjudicates outcomes; evidence-language rule; **100% QA gate**; immutable audit trail. Auto-dispatch = post-trust opt-in, never contractual. | Automating legal/financial determinations invites liability; auditable recommendation sells better to risk depts. |
| **CR-13** ✅ | Registry = **internalLabel spine** + optional external IDs; **spatial auto-binding** via GPS; drift detection via recurring inspections. v1 links **two** systems (identity ↔ ticketing); ERP/BIM = Phase 2. | Real client data is messy at different granularities; spatial join sidesteps manual reconciliation; recurring flights self-maintain the moat. |
| **CR-14** ✅ | **Milestone ladder** (M0 skeleton → M1 concierge market-agnostic launch → M2 native adapters) + **Generic Adapter Suite** (webhook/PDF/CSV) as core product. Multi-tenant native; no self-serve/billing in M1. | Breaks the integration chicken-and-egg; launch on own schedule; solo-founder scope control. |
| **CR-15** ✅ | **Standards-anchored default RuleSets**: IEC TS 62446-3 (solar, measurement layer), ACI 117 + ASTM E1155 (civil, Phase 2); versioned templates, client-overridable. | Ship defensible defaults without a co-developer; standards classify, client adjudicates (CR-12). |

**Phase 0 (feasibility) — CLOSED.** **Phase 1 (build)** underway: see `M0-WALKING-SKELETON-SPRINT.md`.
