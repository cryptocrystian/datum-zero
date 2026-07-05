# M0 Ticket Briefs (M0-05 → M0-12)

Hand these to Claude Code **one at a time**, in order — each depends on the previous. Every brief is a
paste-ready prompt. All of them assume Claude Code has read `MANIFEST.md`, `CLAUDE.md`, and
`docs/PRD-Corrections-Log.md` and treats them as binding. Global rules that apply to *every* ticket:

- **Tenant-scope everything** by `organizationId`. **Fail closed.** **Evidence, not verdict** in any
  client-facing text. **No secrets in DB/logs** (use `secretVaultKey`). **Idempotent** side effects.
- Run `pytest tests/guardrails` and boot the affected service before committing.
- If a locked decision needs to change, **stop and flag it** (bring it to the architect thread) rather
  than working around it. New decisions get a new CR in `docs/PRD-Corrections-Log.md` in the same commit.
- Conventional commits referencing the ticket + CR.

---

## M0-05 — Inference: thermal detector + callback

> **Prerequisite — land the CR-16 schema first (it unblocks anomaly creation before binding exists).**
> Make `Anomaly.assetId` **nullable** and add `Anomaly.spatialBindingStatus` enum
> `{ UNBOUND_REVIEW, BOUND }` defaulting to `UNBOUND_REVIEW`. Create the migration and add the CR-16
> entry to `docs/PRD-Corrections-Log.md`. Rationale: an anomaly is created at inference time, *before*
> it is spatially bound (binding is M0-06), and real detections can land off-registry — so a required
> `assetId` at creation is impossible, and guessing an asset would misroute a work order. Only the
> schema lands here; the binding *logic* is M0-06.
>
> Then implement M0-05 itself. In `services/inference`, add a deterministic thermal-threshold detector
> (a stub — real CV is bought/fine-tuned later per CR-10; determinism matters for testing). Flow: given
> an `IngestionSession`, download the image via the M0-04 `StoragePort`, detect a hot region, and
> produce `confidence_score`, `metric_delta` (°C), `metric_unit`, `bounding_box`, spatial coordinates
> (from the fixture/metadata), and write `visual_crop` + `analytics_crop` back through `StoragePort`.
> POST an **evidence-only** payload to a new Next.js route `POST /api/v1/inference/callback`, which
> creates the `MediaAsset` (if needed) and an `Anomaly` — org-scoped — with `modelVersion` and raw
> metrics set, **`assetId = null` and `spatialBindingStatus = UNBOUND_REVIEW`** (M0-06 binds it), and
> `status` left at its `PENDING_QA` default. **No** classification/recommendation here (that's M0-07).
> The engine measures only — never adjudicates, never emits verdict words.
> AC: posting the sample image deterministically creates one *unbound* `Anomaly` with `modelVersion` and
> metrics; nothing can dispatch while unbound.
> Commit: `feat(inference): thermal detector + callback (M0-05, CR-12, CR-16)`.

## M0-06 — Spatial auto-binding (fail closed on identity)

> Implement ticket **M0-06** — **binding logic only** (the CR-16 schema landed in M0-05). Resolve each
> `UNBOUND_REVIEW` `Anomaly` to the nearest `Asset` **within the same organization** by geospatial
> nearest-neighbor on `latitude/longitude`. Apply a distance threshold: if the nearest asset is beyond
> it, or two are within tolerance of each other, **do not guess** — leave it `UNBOUND_REVIEW` for human
> binding. On a confident match, set `assetId` and `spatialBindingStatus = BOUND`. Keep the query
> strictly org-scoped; unbound anomalies never dispatch (fail closed).
> AC: a sample detection binds to the correct seeded `internalLabel`; a detection outside the grid stays
> `UNBOUND_REVIEW`, not force-matched.
> Commit: `feat(binding): spatial auto-bind with fail-closed review (M0-06, CR-13)`.

## M0-07 — Tolerance eval + IEC 62446-3 classification

> Implement ticket **M0-07**. For each `BOUND` anomaly, evaluate it against the org's `RuleSet`(s) for
> its modality (`triggerMetric` / `operator` / `thresholdValue`). On a match, set `standardRef`, a
> `classification` drawn from the IEC TS 62446-3 thermal-abnormality matrix (map `metricDelta` → a
> category), link `ruleSetId`, and generate an **evidence-framed** `recommendation` string
> (measurement + "review recommended vs. <standard>"). `status` stays `PENDING_QA`.
> The `recommendation` generator output must pass the verdict-language guard — add a unit test feeding
> it representative anomalies and asserting no `violation/breach/back-charge/penalty/liable`.
> AC: classification + `standardRef` populated; recommendation passes the guard; anomaly linked to its
> ruleset. Commit: `feat(rules): tolerance eval + IEC 62446-3 classification (M0-07, CR-12, CR-15)`.

## M0-08 — QA cockpit + 100% gate (server-enforced)

> Implement ticket **M0-08**. Add a minimal Next.js cockpit review-queue page listing `PENDING_QA` and
> `UNBOUND_REVIEW` anomalies (org-scoped) with crop, finding, and recommendation. Actions: **Approve**
> (→ `APPROVED_DISPATCHED`, stamp `reviewedById` + `reviewedAt`, then enqueue dispatch) and **Reject**
> (→ `REJECTED_FALSE_POSITIVE`). Unbound items support manual asset binding first.
> The 100% gate is enforced **server-side**: any dispatch of an anomaly without `reviewedById` must be
> rejected at the service layer, not just hidden in the UI. Add a guardrail test asserting no code path
> dispatches an unapproved anomaly.
> Auth is out of M0 scope — use a stubbed authenticated reviewer identity, but the gate is real.
> AC: nothing dispatches without an approval; the server refuses to dispatch an unapproved anomaly.
> Commit: `feat(cockpit): QA review queue + server-enforced 100% gate (M0-08, CR-12)`.

## M0-09 — Outbox: rate-limited, idempotent generic webhook

> Implement ticket **M0-09**. On approval, create a `WorkOrderDispatch` per active `Integration` route
> target and enqueue via BullMQ/Redis. A worker renders the payload from
> `packages/adapters/contracts/work-order.schema.json` (evidence-framed) and POSTs to the
> `GENERIC_WEBHOOK` target. **Validate the payload against the JSON Schema at runtime before sending**
> (and in a test). Enforce idempotency via `idempotencyKey`, rate-limit (≤5 concurrent req/s per org
> token), retry 5xx with backoff, and record `isResolved` + `downstreamRef`.
> AC: an approved anomaly produces a schema-valid payload delivered to a test webhook; redelivery is
> idempotent; a simulated 5xx retries with backoff.
> Commit: `feat(outbox): rate-limited idempotent generic webhook delivery (M0-09, CR-05, CR-12)`.

## M0-10 — Native Jira sandbox adapter

> Implement ticket **M0-10**. Add a `NATIVE_JIRA` adapter behind the **same routing interface** as the
> generic webhook. From the identical canonical payload, create a Jira Cloud issue (project `DZ`) with
> an evidence-framed summary/description. Read credentials from the configured `secretVaultKey`
> (env-backed in dev) — never from the DB. Because the seed has both integrations active, one approval
> must fan out to **both** the generic webhook and Jira via the outbox.
> AC: one approval yields a Jira issue AND a generic webhook call; both go through the outbox; the Jira
> text passes the verdict-language guard. Commit: `feat(adapters): native Jira sandbox adapter (M0-10, CR-05)`.

## M0-11 — Audit provenance readback

> Implement ticket **M0-11**. Given a `WorkOrderDispatch` id, return the full provenance chain in one
> call (cockpit view or API): source `MediaAsset`/image, `modelVersion`, `confidenceScore`, the rule hit
> (`ruleSet` + `standardRef` + `classification`), reviewer (`reviewedById` + `reviewedAt`), all
> timestamps, and `downstreamRef`. This operationalizes the CR-12 audit-trail requirement — a
> determination must be fully reconstructable because clients will contest it.
> AC: one call returns the complete chain for a dispatched work order.
> Commit: `feat(audit): provenance readback for dispatched work orders (M0-11, CR-12)`.

## M0-12 — End-to-end DoD test + demo runbook

> Implement ticket **M0-12**. Write an automated end-to-end test that runs the sprint's Definition-of-
> Done path: `seed → ingest sample → inference → spatial bind → classify → QA approve → dispatch to
> generic webhook + Jira (mocked) → assert the full audit chain and that both payloads are schema-valid
> and evidence-framed`. Wire it into `.github/workflows/ci.yml`. Then write a 2-minute demo runbook
> (`docs/DEMO-RUNBOOK.md`) that reproduces the flow from `pnpm db:seed`.
> AC: the DoD test passes in CI; the runbook reproduces the demo. This closes M0.
> Commit: `test(e2e): walking-skeleton DoD path + demo runbook (M0-12)`.

---

### After M0 closes
Bring the green M0 back to the architect thread. Next decisions to make together before M1: real auth +
tenancy isolation (RLS), the SkyWatch/COI verification adapters (CR-10), the Infield Validator PWA
quality checks (CR-11), and turning on `graphify` now that the codebase spans real services.
