# M0 — Walking Skeleton Sprint

**Goal:** prove the entire Datum Zero spine end-to-end on **one** sample solar-thermal image, with
nothing built for breadth or polish. When this is done, the core thesis is de-risked and you have a
demo. Read `../MANIFEST.md` first — this sprint obeys every commandment in it.

## Definition of Done (the one acceptance test)

> A seeded tenant's sample thermal image flows: **upload → inference (detect + classify per IEC TS
> 62446-3) → spatial auto-bind to a seeded Asset → RuleSet evaluation → `PENDING_QA` → human approves
> in the cockpit → work order delivered to BOTH (a) a generic webhook endpoint and (b) the Jira
> sandbox — each carrying a complete, evidence-framed payload and a full audit record.**

If any link is unverified (no airframe binding, no coverage on a mission path) the pipeline **fails
closed** and the anomaly never dispatches.

## Explicitly OUT of scope for M0

Self-serve registration, billing, the full Infield Validator PWA UI, real production CV accuracy,
native adapters beyond the Jira sandbox reference, multi-image batching, auto-dispatch, ERP/BIM links,
the marketplace/insurance runtime (modeled in schema, not exercised in the loop).

---

## Backlog (ordered — each ticket has an acceptance criterion)

### Foundations
- **M0-01 · Monorepo + tooling.** pnpm workspaces; `apps/web` (Next.js 15 TS/Tailwind), `services/inference`
  (FastAPI), `packages/db` (Prisma). Local Postgres + Redis via `docker-compose`.
  *AC: `pnpm dev` boots web + a healthcheck on the inference service; `docker compose up` gives Postgres+Redis.*
- **M0-02 · Prisma migrate.** Apply `packages/db/prisma/schema.prisma`; generate client.
  *AC: `prisma migrate dev` succeeds; multi-tenant tables exist with `organizationId` scoping.*
- **M0-03 · Concierge seed script.** `scripts/seed` provisions one `Organization`, one `ClientContract`
  (required profile), a small `Asset` grid with real `lat/long`, one IEC-62446-3 `RuleSet` template, and
  one `GENERIC_WEBHOOK` + one `NATIVE_JIRA` `Integration`.
  *AC: `pnpm seed` creates a fully queryable tenant with no UI involved. (CR-14)*

### Pipeline
- **M0-04 · Ingestion stub.** Minimal authenticated upload of a sample thermal image + metadata to S3
  (or MinIO locally); create `IngestionSession` + `MediaAsset`. Bind session to a seeded verified
  `PilotHardware` (serial match); set `isNdaaVerified` accordingly.
  *AC: uploading the sample creates the rows and binds to a verified airframe; an unbound serial fails closed. (CR-11)*
- **M0-05 · Inference service (stub model).** FastAPI worker consumes the S3 event, runs a **simple
  thermal-threshold detector** (buy/fine-tune real models later — CR-10), returns confidence + `metricDelta`
  + `boundingBox` + crop URLs via `POST /api/v1/inference/callback`.
  *AC: callback creates an `Anomaly` with `modelVersion` set; deterministic on the sample.*
- **M0-06 · Spatial auto-binding.** Resolve the detection's `lat/long` to the nearest seeded `Asset`
  (Postgres geospatial / nearest-neighbor).
  *AC: the anomaly attaches to the correct `Asset.internalLabel`; ambiguous/no-match is flagged, not guessed. (CR-13)*
- **M0-07 · RuleSet evaluation + classification.** Evaluate the anomaly against the IEC-62446-3 RuleSet;
  set `standardRef`, `classification`, and an evidence-framed `recommendation`; status → `PENDING_QA`.
  *AC: recommendation text passes the verdict-language regex guard; contains no "violation/breach". (CR-12, CR-15)*

### Human gate + delivery
- **M0-08 · QA cockpit (minimal).** A single internal review-queue screen: view crop + finding, Approve /
  Reject. Approve stamps `reviewedById` + `reviewedAt`.
  *AC: nothing dispatches without an approval; 100% gate enforced server-side. (CR-12)*
- **M0-09 · Outbox + Generic Webhook adapter.** On approval, enqueue a `WorkOrderDispatch` via BullMQ;
  render per `packages/adapters/contracts/work-order.schema.json`; POST to a test webhook endpoint;
  idempotent + rate-limited + retry.
  *AC: payload validates against the JSON Schema; re-delivery is idempotent; a 5xx retries with backoff.*
- **M0-10 · Jira sandbox adapter.** Same interface, native path: create a Jira Cloud issue from the same
  canonical payload. (Sandbox only — validates the native-adapter pattern.)
  *AC: an approved anomaly produces a Jira issue AND a generic webhook call from one approval. (CR-05)*
- **M0-11 · Audit trail readback.** Given a `WorkOrderDispatch`, reconstruct source image, model version,
  rule hit, reviewer, timestamps.
  *AC: one query returns the full provenance chain. (CR-12)*

### Close
- **M0-12 · End-to-end test + demo script.** Automated test runs the DoD path; write a 2-minute demo runbook.
  *AC: the DoD acceptance test passes in CI; runbook reproduces the demo from `pnpm seed`.*

---

## Sequencing notes (solo + AI-assisted)

Build in dependency order (Foundations → Pipeline → Gate/Delivery). Lean on AI codegen for the
boilerplate (Prisma wiring, FastAPI scaffolding, adapter rendering) and spend your judgment on the two
places that carry risk: **spatial binding correctness (M0-06)** and the **evidence/verdict boundary in
rendering (M0-07/09)**. Keep the sample dataset tiny and deterministic so the whole loop is testable.
