# Local Sandbox — click-around test environment (free, no Docker, no AWS)

One command brings up the whole app — **web + inference + workers** — against native Postgres + Redis,
seeds a demo tenant, and prints how to sign in. This is the **pre-beta test environment**: it runs
entirely on your machine at zero cost. (The AWS path is Terraform, authored-not-applied under M2-6c —
no cloud spend until you run `apply` at beta. The two are complementary: click around locally now,
push-button to AWS at beta.)

## Prerequisites

- **Node + pnpm** (via corepack) and **uv** (for the Python inference service).
- **Native Postgres + Redis**, running under systemd (no Docker — this environment has none by design):

  ```bash
  sudo systemctl start postgresql redis-server
  ```

  The sandbox checks both are reachable and tells you this exact command if either is down.
- A local `.env` (git-ignored) with `DATABASE_URL` (the `datumzero_app` role), `DIRECT_DATABASE_URL`
  (the elevated role), `REDIS_URL`, `INGEST_API_TOKEN`, and `AUTH_SECRET`. Storage is forced to the
  local filesystem for the sandbox, so MinIO/S3 is **not** required.

## Run it

```bash
make sandbox          # or: pnpm sandbox
```

This: verifies Postgres + Redis → applies migrations (elevated role) + seeds the demo tenant → starts
web, inference, and the workers process concurrently with labeled logs. **Ctrl-C stops all three.**

When you see `web | ✓ Ready`, open **http://localhost:3000**.

## Sign in (dev magic-link — no SMTP)

Go to **http://localhost:3000/signin** and enter a seeded email. Because there's no SMTP in dev, the
magic sign-in link is printed **on the `/signin` page** and in the server log — click it to sign in.
(This dev affordance is gated to non-production; the production auth guardrails are untouched.)

| Email | Role | Lands on |
| --- | --- | --- |
| `admin@lighthouse-solar.example` | ADMIN | full cockpit — **start here** |
| `reviewer@lighthouse-solar.example` | REVIEWER | the Validation Queue |
| `pilot@lighthouse-solar.example` | PILOT | pilot view |

The seed provisions a real demo tenant to explore: an Organization, a `ClientContract` (utilities-grade
$5M requirement profile), a standards-anchored `RuleSet` (category→priority map), 24 `Asset`s with
canonical labels + GPS, a **verified airframe** (`DZ-THERMAL-0001`), and a **verified `PilotInsurance`**
that satisfies the contract profile.

## Drive a real capture end-to-end

With the sandbox running, in another terminal:

```bash
make sandbox-demo     # or: pnpm sandbox:demo
```

This POSTs a real EXIF-bearing radiometric TIFF fixture to the upload route. Watch it flow through the
**real M2-7 trigger** — `upload → session-inference queue → worker → inference → callback → Anomaly` —
and appear in the **Validation Queue** within a few seconds (a bound anomaly with a real ΔT and IEC
category). **Approve it** in the queue to fire the outbox (the 100% human-QA gate → work-order dispatch).

## Reset

```bash
pnpm db:reset         # drops, re-migrates, and reseeds the local database
```

## Notes

- No Docker, no AWS, no secret committed; the production auth guardrails are unchanged.
- The sandbox forces `STORAGE_DRIVER=local` (a shared filesystem root) so captures work without MinIO.
