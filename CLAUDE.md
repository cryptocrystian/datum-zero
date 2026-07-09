# CLAUDE.md — always-on rules for Datum Zero

**This file is auto-loaded into every thread. Obey it. It is the enforcement of `MANIFEST.md`.**
The full architecture is in [`MANIFEST.md`](./MANIFEST.md); the *why* is in
[`docs/PRD-Corrections-Log.md`](./docs/PRD-Corrections-Log.md). Do not relitigate locked decisions.

## Before you write code
1. Read `MANIFEST.md` (§0 Ten Commandments) and the CR(s) for the subsystem you're touching.
2. Work one sprint ticket at a time (`docs/M0-WALKING-SKELETON-SPRINT.md`).
3. If a change alters a locked decision, update `docs/PRD-Corrections-Log.md` **in the same commit** and bump `MANIFEST.md`.

## HARD STOP rules (a violation is a bug, not a style nit)
- 🚫 **No verdict language** in any client-facing output. Never emit `violation`, `breach`,
  `back-charge`, `penalty`, `liable`. We report measurements + recommendations only. *(CR-12)*
- 🚫 **No tenant-owned query without `organizationId`.** Every Prisma access to a tenant model is
  org-scoped. *(multi-tenant native)*
- 🚫 **No auto-dispatch without a passing 100% QA approval** (`reviewedById` + `reviewedAt`). *(CR-12)*
- 🚫 **Never bind, collect, or resell insurance.** We verify proof only; fail closed if unverified. *(CR-03, CR-10)*
- 🚫 **No hardcoded coverage limit.** Use the per-client `requiredLiabilityLimit` profile. *(CR-02)*
- 🚫 **No secrets in the repo, DB, or logs.** Reference AWS Secrets Manager via `secretVaultKey`.
- 🚫 **Never commit the DJI Thermal SDK or its wrapper.** The DJI SDK (binary/source/headers) and the
  DJI SDK wrapper module are Confidential (DJI EULA §14). The DJI decoder runs ONLY on DJI-captured
  imagery; load the SDK from an env-configured vendored path, never the repo. *(CR-22)*
- 🚫 **No live Remote-ID / in-browser NDAA attestation claims.** Serial-match against the verified
  airframe registry; default `isNdaaVerified = false`. *(CR-11)*
- ✅ **Fail closed.** Unverified/insufficient state halts the pipeline — never proceed with a warning.

## Conventions (see MANIFEST §3)
- Next.js 15 App Router (Server Components default) · FastAPI inference (separate service) ·
  Prisma/Postgres · BullMQ/Redis · S3 · UUID PKs · `PascalCase` models / `camelCase` fields /
  `snake_case` on the wire.
- All outbound work orders render from `packages/adapters/contracts/work-order.schema.json` and go
  through the idempotent, rate-limited outbox.
- Default RuleSets are standards-anchored (`standardRef`) and versioned; client overrides fork the template. *(CR-15)*

## Commit / thread hygiene
- Conventional commits referencing the ticket + CR, e.g. `feat(adapters): generic webhook renderer (M0-09, CR-12)`.
- Green CI is the gate. The manifest-compliance suite (`tests/guardrails/`) must pass.
- **Migrations are immutable once committed/applied.** Never edit an existing migration file — it
  breaks the Prisma checksum (the M1-04 drift incident). Any schema change goes in a NEW migration.
- Context/memory retrieval: `graphify` (from M1) is a *map* of the code — it does NOT enforce these
  rules. This file and CI do.
