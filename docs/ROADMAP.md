# Datum Zero — Recalibrated Roadmap (Oct 2026)

**Status:** active plan. Supersedes `M2-PLAN.md` as the current sequencing doc (M2-PLAN is retained as the
M2-depth detail/history). Written in light of the Oct 2026 GTM pass
([`GTM-PASS-2026-10.md`](./GTM-PASS-2026-10.md), [`GTM-STRATEGY.md`](./GTM-STRATEGY.md) v1.0) and the
discovery re-status ([`DISCOVERY-AGENDA.md`](./DISCOVERY-AGENDA.md)).

> **Why recalibrate:** the plan docs predate most of what's now built, and the GTM pass changed the North
> Star — from "ship features" to "deploy and land the first real account, provenance-forward." The center of
> gravity moves from *building* to *deploying + proving + selling*.

---

## 1. Current state — honest assessment

**The product is substantially built and CI-green. It is neither deployed nor proven with a real user.**
That one sentence is the whole reason this plan looks the way it does.

| Subsystem | State | Ref |
|---|---|---|
| Core pipeline (ingest → inference → QA gate → idempotent outbox) | ✅ Built | M0, M2-7/CR-36 |
| Inference (radiometric FLIR/TIFF/DJI decode, detector + classifier, IEC mapping, real ΔT, geometry) | ✅ Built | M2-1/2, CR-22–30 |
| Infield Validator PWA firewall (radiometric/glare/coverage/GPS/completeness + airframe screening) | ✅ Built | M2-3, CR-31/32 |
| Insurance verification (concierge/manual) + fail-closed dispatch gate | ✅ Built | M2-4a, CR-33 |
| Auth (magic-link) + RLS dual-role + production email (SES) | ✅ Built | M1-01/02, CR-20/34 |
| Cockpit (QA queue, policy/RuleSet builder, asset registry, integrations config, user mgmt) | ✅ Built | M1/M3 |
| Generic delivery adapters (webhook/PDF/CSV) + unified envelope + provenance-readback API | ✅ Built | M1, M2-PREP/CR-21 |
| Containerization + composed-stack DoD | ✅ Built | M2-6a/b, CR-35 |
| **Design-system v2 adoption across cockpit screens** | 🟡 Finishing | M3-1R/CR-40 (components shipped; wiring across screens in progress) |
| **AWS infra** | 🟡 **Authored, NOT applied — no running environment** | M2-6c/CR-37 |
| Observability (M2-6d), domain/TLS/SES prod-access (M2-6e) | 🔲 Pending | CR-35 sequence |
| Tamper-evident audit ledger (CR-41) | 🔲 Not built (new this session) | CR-41 |
| Capture-source generalization (CR-42) | 🔲 Not built — **demand-gated** | CR-42 |
| Billing / metering | 🔲 Not built — **deferred (M1.5), A3-gated** | — |
| Marketing front door | 🔲 Not built | CR-18 (gated) |
| Native CMMS adapters, automated insurance (M2-4b) | 🔲 Not built — **demand-driven** | CR-14 |

**Read:** we over-delivered on M2/M3 depth and under-delivered on **consummating M1** — the concierge launch
to a lighthouse account, which was always the point of M1.

---

## 2. North Star (restated)

**Consummate M1: deploy for real, then land and serve the first concierge lighthouse account on the
solar-thermal beachhead — provenance-forward.** That account is simultaneously the revenue, the reference
logo, and (per the discovery re-status) the primary validation vehicle for the §0 working assumptions.
Everything below is ordered by "does it gate landing + serving that account."

---

## 3. The critical path — tracks in priority order

### T1 — Deploy for real *(gates everything customer-facing — highest priority)*
You cannot onboard a customer onto a dev machine. Finish the deployment tail:
- **Apply the Terraform baseline** (the authored M2-6c stack). ⚠️ This provisions **paid AWS infra and is a
  human/cost decision**, not just an engineering task (CR-37) — the founder's call on when to start the meter.
- **M2-6d — observability** (logs/metrics/traces/alerts across web/worker/inference).
- **M2-6e — domain, TLS, SES production-access** (exit the SES sandbox; SPF/DKIM/DMARC — the manual ops from
  CR-34).
- Exit criterion: the composed-stack DoD runs green **on real AWS**, not just in CI.

### T2 — Provenance differentiator *(the new headline — run parallel to T1)*
The GTM pass made provenance/audit the moat and the pitch. Make it real and visible:
- **Audit ledger (CR-41), layers 1–2:** append-only hash-chained `AuditLogEntry` (DB-enforced append-only
  for the runtime role) + KMS-signed determinations. *(Renumber the track — `M2-8` is already used by the
  local-sandbox commit; use **M2-9** or a named LEDGER track; the CR-41 draft's `M2-8a/b/c` labels need
  correcting.)*
- **Surface provenance** in the cockpit review flow (the `/api/v1/audit/provenance/[dispatchId]` readback
  already exists — this is a presentation layer, not new data).
- Layer 3 (external RFC-3161 / OpenTimestamps anchoring) stays the **demand-gated compliance tier** — build
  on first EU/compliance-sensitive demand, not now.

### T3 — Cockpit finish *(run parallel to T1)*
Make the QA cockpit credible in a demo and usable day-to-day:
- Complete M3 design-system adoption — wire `Panel`/`Card`/`Field` across queue / registry / policies /
  integrations / users (CR-40 noted the components shipped but were under-adopted).
- Walk the full reviewer path end-to-end (PENDING_QA → approve → dispatch) and fix the rough edges a real
  reviewer would hit.

### T4 — Go-to-market readiness *(needs T1 deployed + T3 credible + T2 story)*
- **Concierge onboarding path:** a repeatable tenant seed/provision runbook (the M1 concierge posture — no
  self-serve) so a real account can be stood up in hours, not days.
- **Provenance-forward demo:** update `DEMO-RUNBOOK.md` to tell the v1.0 story (sensor-agnostic verification
  + defensible, provenanced work order routed into the client's system).
- **Lightweight front door:** a CR-18-reconciled one-pager / minimal site carrying the v1.0 messaging
  (GTM-STRATEGY §11) — not a full marketing build; concierge sales needs a credible front, not a funnel.

### T5 — Land + serve the account *(continuous; the real validation)*
Direct, concierge. This is **sales, not build** — and it's the hardest non-engineering dependency (the
account must be *sourced*). Serving it validates A1–A4 for free (DISCOVERY-AGENDA §0) and prices the deal
(resolving A3).

**Sequencing:** T2 + T3 run parallel to T1 (app-layer, no infra dependency). T4 needs T1 (deployed) + T3
(credible) + T2 (story). T5 overlaps T4 — start sourcing the account now; onboard once T1/T4 land.

---

## 4. Explicitly parked (with the trigger that unparks each)

Keeping these parked is what preserves the pivot-friendly, lean posture.

| Parked | Why | Unpark trigger |
|---|---|---|
| CR-42 capture-source generalization | Demand-gated; the spine already absorbs it | First Ring-2 / robot / autonomous deal |
| Billing / metering | A3 unvalidated; unit of value cheap to switch | First deal that prices itself (resolves A3) |
| M2-4b automated insurance adapters | Concierge verification suffices now | A pilot/deal whose volume needs it |
| Native CMMS adapters (Maximo/SAP/…) | Generic adapter is the day-one surface | Contract-funded (CR-14) |
| Evidence-vault full UI | Provenance API already exists as the data source | Post-lighthouse, when a customer asks to self-serve audits |
| Robotics ingestion (Ring 2) | Beachhead first | First robot deal (rides CR-42) |
| Deep IEC-conformance hardening | Classification already ships; good-enough for beachhead | A1 signal that a standard is contractually required |

---

## 5. Standing disciplines (carried from the GTM pass)

- **Honor the CR-42 compliance-profile seam shape** whenever you touch the pilot/insurance cluster, even
  though only the aviation profile exists — keeps the later generalization additive.
- **Build no billing/metering until a real deal prices it** (A3 held loosest).
- **Adapters stay demand-driven** (CR-14); the generic adapter is the product.
- **The invariants are unchanged:** evidence-not-verdict (CR-12), fail-closed, 100% human QA,
  `organizationId` scoping, never-bind (CR-03). Nothing here touches them.

---

## 6. Risks & honest caveats

- **Applying Terraform starts a real AWS bill** and is a founder decision — T1 has a cost gate, not just a
  code gate. Consider a minimal/scaled-down prod footprint for a single lighthouse tenant.
- **Solo-founder bandwidth:** T1–T4 are sequenced, not all-parallel; T1 + T2 are the two to carry first.
- **The lighthouse account must be sourced** — the critical dependency is outside the codebase. No amount of
  build substitutes for it; start the sales/relationship work now, in parallel.
- **Ops surface:** observability + SES prod-access + DNS are manual, outside the app — budget real time for
  M2-6d/e, they're not just tickets.

---

## 7. What this does NOT change

The spine (`Asset → IngestionSession → MediaAsset → Anomaly → RuleSet → WorkOrderDispatch → Integration`),
every core invariant, and all the M0–M3 work already shipped. This is a resequencing toward deployment +
the first account, not a teardown. The beachhead (Ring 1) remains the focus; Rings 2–3 stay on the GTM
roadmap, unbuilt and demand-gated.
