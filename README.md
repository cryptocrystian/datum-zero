# Datum Zero Systems

**Autonomous Reality Ledger Reconciliation** — a headless verification layer that turns physical-reality capture (drone thermal/RGB, 360° video, IoT) into verified, evidence-framed work orders routed into a client's existing systems.

> **Read [`MANIFEST.md`](./MANIFEST.md) before writing any code.** It is the single source of truth for architecture, conventions, and the non-negotiable product/compliance rules. Every development thread, code-generation sequence, and engineering hire inherits those decisions without relitigating them.

---

## Repository layout

```
datum-zero/
├── MANIFEST.md                       # ← THE core system manifest (start here)
├── README.md
├── docs/
│   ├── M0-WALKING-SKELETON-SPRINT.md # active sprint backlog
│   └── PRD-Corrections-Log.md        # CR-01..CR-15 — the "why" behind every decision
├── apps/
│   └── web/                          # Next.js 15 (App Router) — cockpit + Infield Validator PWA
├── services/
│   └── inference/                    # FastAPI (Python) — CV + spatial engine
├── packages/
│   ├── db/prisma/schema.prisma       # multi-tenant data model (all CRs applied)
│   ├── adapters/                     # Generic Delivery Adapter Suite (webhook / PDF / CSV)
│   │   └── contracts/work-order.schema.json
│   └── rulesets/                     # standards-anchored default RuleSet templates (IEC 62446-3)
└── scripts/
    └── seed/                         # concierge onboarding — manual tenant provisioning
```

## Current phase

**M0 — Walking Skeleton.** Thin end-to-end loop on sample solar-thermal data. See `docs/M0-WALKING-SKELETON-SPRINT.md`.

## Build context

Solo founder + AI-assisted. Optimize for leverage, buy-over-build, and ruthless scope control. M1 is **concierge-onboarded** (multi-tenant-native DB, but no self-serve registration / public billing / self-onboarding in initial scope).
