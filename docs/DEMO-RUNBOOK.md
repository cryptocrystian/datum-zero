# M0 Walking-Skeleton — 2-Minute Demo Runbook

Reproduces the full **Definition of Done** locally: seed → ingest → inference → spatial-bind →
classify → 100% QA approve → fan-out dispatch (generic webhook + Jira) → audit provenance. Every
external HTTP target is mocked, so this runs with **no live Jira/webhook** and no cloud.

> The automated version of this exact path is `apps/web/e2e/dod.e2e.ts` (run in CI against Postgres +
> Redis service containers). This runbook is the human walkthrough.

## Prerequisites
- Node 20, pnpm (via `corepack enable`), and (for the inference service) `uv`.
- **Postgres 16 + Redis.** Default local path: run them as **native systemd services** (Postgres on
  `localhost:5432`, stock `redis-server`), `enable`d so they're always up — no Docker needed. The
  container alternative is `docker-compose.yml` (Postgres + Redis + MinIO), which is also what CI runs.
- `cp .env.example .env` (dev defaults point at `localhost:5432` / Redis, which both paths satisfy).

## 1. Infra + schema + seed (~30s)
```bash
# Native path (default): Postgres + Redis are systemd services — nothing to start.
# Container alternative (only if not running native services):  pnpm infra:up   # docker compose up -d
pnpm --filter @dz/db exec prisma migrate deploy   # runs as the dz superuser via directUrl (CR-20)
pnpm db:seed                  # 1 org · assets grid · IEC 62446-3 RuleSet · webhook + Jira integrations · verified airframe
```

## 2. Run the automated DoD path (~30s)
```bash
pnpm --filter @dz/web test:e2e
```
This asserts, in one deterministic run:
- **ingest** binds the capture to a **verified airframe** (CR-11), else fails closed;
- **inference callback** persists the anomaly **UNBOUND** (CR-16), then **spatial-binds** it to
  `APEX_SOLAR-GRID_04-ROW_02-STR_03` (CR-13) and **classifies** it per **IEC TS 62446-3** (CR-15);
- nothing dispatches until a reviewer **approves** — the **100% QA gate** is server-enforced (CR-12);
- approval **fans out** to the generic webhook **and** Jira through the idempotent outbox (CR-05);
- both delivered payloads are **schema-valid** and **evidence-framed** (no verdict language, CR-12);
- one `getProvenance()` call reconstructs the **entire chain** (source image → model → rule hit →
  reviewer → timestamps → downstream ref) and is **org-scoped**.

## 3. (Optional) Watch it live in the cockpit
```bash
pnpm dev                      # web on :3000, inference on :8000
pnpm worker                   # outbox delivery worker (separate terminal)
```
Open `http://localhost:3000/queue`, review the finding, and click **[ APPROVE FOR DISPATCH ]**.

## Optional: real Jira create (not used in CI)
The Jira adapter is token-gated. To dispatch to the **real** DZ project instead of the mock, put
credentials in a git-ignored env file the worker loads (`.env.local` first, then `.env`):
```
JIRA_BASE_URL=https://datumzero.atlassian.net
JIRA_EMAIL=<atlassian-account-email>
JIRA_API_TOKEN=<api-token>
```
Then run `pnpm worker` and approve an anomaly — it creates a live **DZ** issue (team-managed issue
type resolved via the project's create-metadata). Without these, the live path stays token-gated and
the e2e mock is used.

---
**This closes M0.** Next: bring the green skeleton back to the architect thread for M1 (real auth +
RLS, the SkyWatch/COI verification adapters, the Infield Validator PWA, and turning on `graphify`).
