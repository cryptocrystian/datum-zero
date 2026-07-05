# Datum Zero Systems — Core System Manifest

**Version:** 1.1.0 · **Status:** Authoritative · **Applies to:** all threads, code-gen, and hires

> **Changelog — 1.1.0:** index CR-16 (unbound-anomaly / `spatialBindingStatus`) and CR-17 (canonical asset labels) in §9. No commandment change.

> This is the single source of truth for how Datum Zero is built. Every development thread,
> code-generation sequence, and engineering hire **inherits these decisions and does not
> relitigate them.** If a change to anything in this manifest is warranted, it is a deliberate
> amendment (bump the version, note it in the decision log) — not an ad-hoc deviation in code.
>
> The **"why"** behind every rule lives in [`docs/PRD-Corrections-Log.md`](./docs/PRD-Corrections-Log.md)
> (decisions CR-01…CR-17). This manifest is the **"what."**

---

## 0. The Ten Commandments (non-negotiable)

These override any generic best-practice default. When in doubt, obey these.

1. **Headless at the edge, thin cockpit inside.** Work orders land in the *client's* system. The end user never logs into Datum Zero to do their job. We build only a back-office cockpit (QA, config, admin) — no end-user operational dashboard. *(CR-06)*
2. **We detect and classify; the client adjudicates.** Datum Zero NEVER asserts a violation, triggers a back-charge, or issues a penalty. Output is evidence + recommendation. *(CR-12)*
3. **Evidence language, never verdict language.** Every emitted artifact says "measured… classified… review recommended." The words *violation, breach, back-charge, penalty, liable* never appear in client-facing output. *(CR-12)*
4. **100% human QA before dispatch.** Every anomaly passes a Datum Zero QA reviewer before any work order leaves the system. Auto-dispatch is a post-trust, per-client opt-in that never covers contractual/financial actions. *(CR-12)*
5. **Fail closed.** Insurance not verified for the window, capture not bound to a verified airframe, coverage below the required profile → the pipeline stops. Absence of proof is failure, not a warning. *(CR-10, CR-11)*
6. **Insurance is referral-only. We verify; we never bind or collect.** No reselling, no white-label, no premium handling. *(CR-03)*
7. **`internalLabel` is the asset identity spine.** External system IDs (BIM/ERP/ticketing) are optional attributes populated incrementally. The product works with the spine + one delivery target. *(CR-13)*
8. **Standards anchor the measurement layer; contracts can override.** Default RuleSets are grounded in published standards (IEC TS 62446-3, etc.), shipped as versioned templates. *(CR-15)*
9. **Multi-tenant native from row zero; concierge onboarding for M1.** Every tenant-owned row is `organizationId`-scoped. No self-serve registration / public billing / self-onboarding in initial scope. *(CR-14)*
10. **Buy/fine-tune, don't build.** The moat is adjudication + audit + routing + the registry — not the CV detector, not COI parsing, not the insurance rails. Integrate vendors for those. *(CR-10, CR-12)*

---

## 1. What we are building

A headless verification layer for heavy-industry physical assets. Reality capture (drone thermal/RGB,
360° video, IoT) is validated on-site, analyzed against standards-based tolerances, reviewed by a human,
and emitted as an evidence-framed work order into whatever system the client already runs.

**Beachhead:** Renewables / solar thermal. Highest core-app weighting, most tractable CV, crisp
standards mapping (IEC TS 62446-3), standardized asset taxonomy, fewest integrations. *(CR-07)*

**Value delivered day one:** a client with no drone pilots and no integration budget still gets clean,
structured, actionable findings — via the Generic Delivery Adapter Suite. *(CR-14)*

---

## 2. Architecture

```
        ┌─────────────────────────────────────────────┐
        │            NEXT.JS 15 (App Router)           │
        │  Back-office cockpit  +  Infield Validator   │
        │  (QA queue, RuleSet builder, registry,       │
        │   integration config, admin)   PWA (field)   │
        └───────────────────────┬─────────────────────┘
                                │  (S3 direct upload; REST)
                                ▼
        ┌─────────────────────────────────────────────┐
        │           FASTAPI INFERENCE SERVICE          │
        │  Python CV + spatial engine (async worker)   │
        │  detect → classify (standard) → spatial-bind │
        └───────────────────────┬─────────────────────┘
                                │  callback: /api/v1/inference/callback
                                ▼
        ┌─────────────────────────────────────────────┐
        │        POSTGRESQL  +  REDIS / BullMQ         │
        │  Prisma models · 100% QA gate · rate-limited │
        │  idempotent outbox → Delivery Adapter Suite  │
        └─────────────────────────────────────────────┘
```

**The pipeline (Ingestion → Inference → QA → Routing):**

1. **Ingest & edge-verify.** Infield Validator PWA runs client-side quality checks (EXIF/XMP,
   exposure, sun-glare via timestamp+GPS, overlap approximation, completeness), then uploads to S3.
   Hardware/NDAA and Remote-ID are handled by serial-matching against the verified airframe registry
   from uploaded telemetry — **not** live broadcast capture. *(CR-11)*
2. **Async inference.** S3 event triggers the FastAPI service: detect, classify against the standard's
   matrix, compute `metricDelta`, crop, resolve `latitude/longitude` to an `Asset` via spatial join, and
   write an `Anomaly` in `PENDING_QA`.
3. **Human QA gate.** 100% of anomalies are reviewed in the cockpit before dispatch. *(CR-12)*
4. **Outbox routing.** On approval, a `WorkOrderDispatch` is enqueued via BullMQ (rate-limited,
   idempotent, token-refreshing) and rendered per the canonical payload to the client's delivery targets.

---

## 3. Tech stack & conventions

| Layer | Choice | Notes |
|---|---|---|
| Web / cockpit / PWA | **Next.js 15 (App Router), TypeScript, Tailwind** | Server Components by default; client components only where needed. |
| Inference | **FastAPI (Python)**, async workers | Isolated service; communicates via REST callback. CV models are **bought/fine-tuned**, not built. |
| ORM / DB | **Prisma + PostgreSQL** | Schema is law: `packages/db/prisma/schema.prisma`. |
| Queue / outbox | **BullMQ on Redis** | Rate-limited (≤5 concurrent req/s per org token), idempotent, auto token refresh. |
| Object storage | **AWS S3** | Hot tier = crops/snippets; Cold tier = raw masters → Glacier after 48h. |
| Secrets | **AWS Secrets Manager** | Integration credentials referenced by `secretVaultKey`. Never store secrets in Postgres. |
| Payments (marketplace) | **Stripe Connect** | Pilot **payout only**. Never insurance premium. *(CR-03)* |

**Conventions**
- **Monorepo** (`apps/`, `services/`, `packages/`, `scripts/`, `docs/`).
- **Tenant scoping is mandatory.** Every tenant-owned query is filtered by `organizationId`. Prefer
  Postgres Row-Level Security as defense-in-depth.
- **UUID primary keys** everywhere.
- **Naming:** `PascalCase` models, `camelCase` fields (Prisma); `snake_case` JSON on the wire
  (see the payload contract).
- **No secret material in the DB or logs.** Reference the vault.
- **Idempotency is required** on every outbound dispatch (`idempotencyKey`).

---

## 4. Data model principles

Full schema: [`packages/db/prisma/schema.prisma`](./packages/db/prisma/schema.prisma). Key patterns:

- **`Organization` is the multi-tenant root.** Everything hangs off it. `onboardingState` defaults to
  `CONCIERGE_PROVISIONED`. *(CR-14)*
- **Asset registry spine.** `Asset.internalLabel` is canonical. `cadObjectId` / `erpAssetId` /
  `procoreLocationId` are **nullable, incrementally-populated** attributes. `latitude/longitude` +
  `geoBoundary` power the **spatial auto-binding** join. *(CR-13)*
- **`Anomaly` is an evidence record.** It carries the measurement layer (`standardRef`, `classification`,
  `confidenceScore`, `metricDelta`) and the adjudication boundary (`recommendation`, `status`) plus an
  **audit trail** (`modelVersion`, `reviewedById`, `reviewedAt`). *(CR-12, CR-15)*
- **`RuleSet` is a versioned, standards-anchored template.** `standardRef` + `standardVersion` +
  `isTemplate` + `version`; client overrides fork from the shipped default. *(CR-15)*
- **Insurance is a proof record, not a transaction.** `PilotInsurance` verifies coverage
  (`isVerified`, `verificationSource`, profile flags: `hasBlanketAI`, `hasPrimaryNonContrib`,
  `hasWaiverOfSubrogation`). `ClientContract` carries the **required profile**. Missions gate on
  `coverageVerified`. *(CR-02, CR-03, CR-09, CR-10)*
- **Verified airframe registry.** `PilotHardware.ndaaVerified` + `approvedListRef`; `IngestionSession`
  binds to it and defaults `isNdaaVerified = false`. *(CR-11)*

---

## 5. The Generic Delivery Adapter Suite (M1 product surface)

The suite makes us universally compatible on day one. Contract:
[`packages/adapters/contracts/work-order.schema.json`](./packages/adapters/contracts/work-order.schema.json).

- **`GENERIC_WEBHOOK`** — the canonical evidence-framed JSON payload. Any client's IT team maps it to
  their ticketing tool in ~30 minutes; Datum Zero writes zero custom integration code.
- **`PDF_DISPATCH`** — an actionable field report (visual crop + thermal delta + 6-dp coordinate +
  standard reference), for lower-maturity operators. Hand it straight to a crew.
- **`CSV_S3`** — structured data mapped to standard asset-hierarchy columns, dropped to a
  client-specific S3 bucket.

**Adapter rules**
- All targets sit behind one **routing interface**; native adapters (`NATIVE_*`) implement the same
  interface and are **demand-driven (M2)** — built when paying traction or contract funding justifies. *(CR-05)*
- Every payload is rendered from the canonical contract and is **evidence-framed** — the `recommendation.text`
  field is regex-guarded against verdict language. *(CR-12)*
- Delivery is via the **idempotent, rate-limited outbox** (`WorkOrderDispatch`).

---

## 6. RuleSets & standards

- Ship **default RuleSet templates grounded in published standards** so no third party is needed to
  define what an anomaly is. *(CR-15)*
  - **Solar (beachhead): IEC TS 62446-3** — the standard's thermal-abnormality **matrix** drives the
    `classification`; it is a *detection/classification methodology (a guideline)*, **not** a contractual
    pass/fail. It lives in the **measurement** layer.
  - **Civil/concrete (Phase 2): ACI 117** (primary tolerance spec); **ASTM E1155** for floor flatness only.
- Standards define **how we classify**; the **client adjudicates the consequence.** *(CR-12)*
- Defaults are **versioned templates**; a client's contract can override thresholds. Store
  `standardRef` + `standardVersion` for auditability.

---

## 7. Compliance, risk & security rules

- **Adjudication boundary (CR-12):** evidence + recommendation only; 100% human QA before dispatch;
  immutable audit trail on every anomaly; regex-guard client-facing text against verdict language.
- **Insurance (CR-03/09/10):** referral-only, verify-never-bind, fail closed; require pilots to carry a
  **dedicated aviation policy with blanket AI + primary/non-contributory + waiver of subrogation**;
  verify via provider API (on-demand) or COI vendor (BYO); re-verify just before the flight window.
- **NDAA / Remote ID (CR-11):** platform-enforced verified airframe registry + capture-time serial
  match from telemetry. Do **not** claim in-browser NDAA attestation or live Remote-ID capture.
- **Tenancy & secrets:** `organizationId` scoping everywhere; RLS as defense-in-depth; secrets in AWS
  Secrets Manager, never the DB.
- **Legal facilitation (CR-04, open):** embedded referral model (insurer = seller of record); confirm
  with counsel before automating anything money- or placement-adjacent.
- **SOC 2 track:** continuous-monitoring tooling (Vanta/Drata) is an M2 concern; keep the audit trail
  and access model clean from day one so it's not a retrofit.

---

## 8. Milestone ladder

- **M0 — Walking Skeleton (internal).** Thin end-to-end loop on sample solar-thermal data. Jira Cloud =
  internal sandbox to validate the outbox/native pattern; **also exercise the generic webhook** (the real
  M1 surface). Deliverable proves the spine and doubles as the demo. See
  [`docs/M0-WALKING-SKELETON-SPRINT.md`](./docs/M0-WALKING-SKELETON-SPRINT.md).
- **M1 — Market-Agnostic Launch (concierge).** PWA + spatial auto-binding + polished Generic Delivery
  Adapter Suite. Multi-tenant-native DB, but **no self-serve/billing/self-onboarding** — tenants seeded
  via `scripts/seed`. Launch through a few concierge-onboarded lighthouse accounts.
- **M1.5 — Self-serve flip.** Registration + billing + self-onboarding, once reference logos exist.
- **M2 — Demand-driven depth.** Native adapters (contract-funded), auto-dispatch opt-in (evidence-only,
  never contractual), ERP/BIM registry depth, SOC 2 Type II.

**In scope for M0/M1:** core data pipeline, spatial auto-binding engine, generic delivery adapters, QA
cockpit, concierge seeding. **Out of scope for M1:** self-serve registration, public billing checkout,
native enterprise adapters, marketplace payment automation, auto-dispatch.

---

## 9. Decision inheritance

Every rule here traces to a locked decision in [`docs/PRD-Corrections-Log.md`](./docs/PRD-Corrections-Log.md):

| Area | Decisions |
|---|---|
| Insurance provider / model / verification | CR-01, CR-03, CR-04, CR-10 |
| Coverage adequacy & additional-insured | CR-02, CR-09 |
| Integrations / adapters | CR-05, CR-14 |
| Headless vs. cockpit / QA gate | CR-06, CR-12 |
| Beachhead | CR-07 |
| Marketplace sequencing | CR-08 |
| Infield Validator / NDAA / Remote ID | CR-11 |
| Adjudication boundary & audit | CR-12 |
| Asset Registry | CR-13 |
| Milestone ladder & generic adapter | CR-14 |
| Standards-based RuleSets | CR-15 |
| Anomaly spatial-binding lifecycle | CR-16 |
| Canonical asset labels | CR-17 |

---

## 10. Glossary

- **Evidence vs. verdict** — we report measurements + recommendations (evidence); the client renders the
  decision (verdict). We never render verdicts.
- **Spine** — the `internalLabel` canonical asset identity; external IDs attach to it over time.
- **Spatial auto-binding** — resolving a detection's GPS to the nearest registry asset via geospatial join.
- **Requirement profile** — the full insurance requirement (limit + dedicated aviation + AI + P&NC +
  waiver of subrogation + window), not just a dollar limit.
- **Concierge onboarding** — manual tenant provisioning via seed scripts; no self-serve in M1.
- **Fail closed** — unverified/insufficient state halts the pipeline rather than proceeding with a warning.
