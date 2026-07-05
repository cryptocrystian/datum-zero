---
name: datum-zero-architect
description: >
  Architecture and engineering conventions for the Datum Zero Systems platform. ALWAYS use this skill
  when writing, reviewing, or planning ANY Datum Zero backend, data-model, inference, adapter, ruleset,
  or pipeline code — Next.js/FastAPI/Prisma/BullMQ work, the generic delivery adapters, the tolerance
  engine, the asset registry, or the insurance/airframe verification flows. It encodes the locked
  MANIFEST decisions (CR-01..CR-15) so generated code inherits them instead of relitigating them.
  Trigger whenever the repo, "Datum Zero", "reality ledger", the work-order contract, or any file under
  apps/web, services/inference, or packages/* is involved.
---

# Datum Zero — Architect Skill

> Install: **Settings → Capabilities** (Cowork), or place at `.claude/skills/datum-zero-architect/SKILL.md`
> (`--project`) in the repo. This mirrors the always-on `CLAUDE.md` but carries the deeper playbook.
> Source of truth: `MANIFEST.md`; rationale: `docs/PRD-Corrections-Log.md`.

## Non-negotiables (fail the review if violated)
1. **Evidence, not verdict.** Detect + classify; the client adjudicates. No `violation/breach/back-charge/penalty` in client-facing output. (CR-12)
2. **100% human QA before dispatch.** `PENDING_QA` → approved (`reviewedById`,`reviewedAt`) → dispatch. Auto-dispatch is a post-trust, per-client opt-in, never contractual. (CR-12)
3. **Fail closed.** Unverified insurance/airframe/coverage halts the pipeline. (CR-10, CR-11)
4. **Insurance = verify, never bind/collect/resell.** Referral-only. (CR-03)
5. **Multi-tenant native.** Every tenant-owned query is `organizationId`-scoped; RLS as defense-in-depth.
6. **`internalLabel` is the asset spine;** external IDs are optional attributes; bind detections spatially by GPS. (CR-13)
7. **Standards anchor measurement, not adjudication.** RuleSets carry `standardRef` + version; client overrides fork the template. (CR-15)
8. **Buy/fine-tune** CV, COI parsing, insurance rails — don't build. The moat is adjudication + audit + routing + registry.

## Stack & patterns
- **Web/cockpit/PWA:** Next.js 15 App Router (Server Components default), TS, Tailwind. Back-office cockpit only — no end-user operational dashboard. (CR-06)
- **Inference:** FastAPI (Python), async; isolated service; returns via `/api/v1/inference/callback`. CV models bought/fine-tuned.
- **Data:** Prisma + Postgres; UUID PKs; `PascalCase` models / `camelCase` fields / `snake_case` on the wire. Schema is law: `packages/db/prisma/schema.prisma`.
- **Queue/outbox:** BullMQ/Redis — rate-limited (≤5 concurrent req/s per org token), idempotent (`idempotencyKey`), token-refreshing.
- **Storage/secrets:** S3 (hot crops / cold masters → Glacier @48h); secrets in AWS Secrets Manager via `secretVaultKey` — never in DB/logs/repo.

## Delivery adapters (M1 product surface)
- One routing interface; targets: `GENERIC_WEBHOOK`, `PDF_DISPATCH`, `CSV_S3`, then demand-driven `NATIVE_*` (M2). (CR-05, CR-14)
- All payloads render from `packages/adapters/contracts/work-order.schema.json` and are evidence-framed (regex-guarded).

## When generating code
- Start from the relevant CR + the schema. Prefer extending the interface over special-casing.
- Add/extend a guardrail in `tests/guardrails/` for any new rule-bearing surface.
- Reference the ticket + CR in the commit. Keep `MANIFEST.md` and code in lockstep.

## Anti-patterns (reject on sight)
- A Prisma query on a tenant model without `organizationId`.
- A work order asserting a contractual consequence, or dispatched without QA approval.
- A hardcoded coverage limit, or any insurance bind/charge path.
- A claim of live Remote-ID capture or in-browser NDAA attestation.
- New native adapter built speculatively before paying traction/contract funding.
