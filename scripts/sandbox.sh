#!/usr/bin/env bash
#
# M2-8 — one-command seeded local sandbox. FREE, no Docker, no AWS.
# Brings up web + inference + workers against native Postgres + Redis (systemd), seeds a demo tenant,
# and prints exactly how to sign in. Ctrl-C stops all three.
#
set -euo pipefail
cd "$(dirname "$0")/.."

B=$'\033[1m'; D=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[0m'

echo "${B}Datum Zero — local sandbox${R}"

# --- 1) Preflight: native Postgres + Redis must be reachable (no Docker by design) ---
if ! pg_isready -q 2>/dev/null; then
  echo "${Y}✗ Postgres is not reachable.${R} Start it, then re-run:  ${B}sudo systemctl start postgresql${R}" >&2
  exit 1
fi
if ! redis-cli ping >/dev/null 2>&1; then
  echo "${Y}✗ Redis is not reachable.${R} Start it, then re-run:  ${B}sudo systemctl start redis-server${R}" >&2
  exit 1
fi
echo "${D}✓ Postgres + Redis reachable${R}"

# --- 2) Apply migrations (elevated role via directUrl) + seed the demo tenant ---
echo "${D}→ applying migrations + seeding demo tenant…${R}"
pnpm --filter @dz/db exec prisma migrate deploy >/dev/null
pnpm --filter @dz/db exec prisma generate >/dev/null
pnpm db:seed

# No Docker/MinIO here, so force LOCAL filesystem storage (a SHARED absolute root the web writes and the
# inference service reads). The dev .env points at MinIO (S3); we override for the no-Docker sandbox.
STORE="$PWD/.data/sandbox-store"
mkdir -p "$STORE"
# The inference callback must carry the token the web callback verifies (inference runs without the web
# .env here, so pass it through). Falls back to the local dev default.
CBTOKEN="$(grep -E '^INFERENCE_CALLBACK_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
: "${CBTOKEN:=local_dev_callback_token}"

# --- 3) The how-to-use banner (services boot below; the web takes a few seconds) ---
cat <<BANNER

${G}${B}══════════════════════════════════════════════════════════════════════${R}
${G}${B}  SANDBOX STARTING — web is ready when you see "web | ✓ Ready" below${R}
${G}${B}══════════════════════════════════════════════════════════════════════${R}

  Web         ${B}http://localhost:3000${R}          Inference  http://localhost:8000/health
  Sign in     ${B}http://localhost:3000/signin${R}   with a seeded email:
                ${B}admin@lighthouse-solar.example${R}     (ADMIN — start here)
                reviewer@lighthouse-solar.example  (REVIEWER)
                pilot@lighthouse-solar.example     (PILOT)

  No SMTP in dev: after you submit the email, the magic sign-in link appears
  ON the /signin page AND in this server log — click it to sign in.

  End-to-end demo (another terminal):  ${B}pnpm sandbox:demo${R}
  Reset + reseed:                      ${B}pnpm db:reset${R}
  Stop everything:                     ${B}Ctrl-C${R}
${G}${B}══════════════════════════════════════════════════════════════════════${R}

BANNER

# --- 4) web + inference + workers, labeled; Ctrl-C forwards SIGINT to all (concurrently). Storage is
#        forced local for web + inference (shared root); the worker needs no storage. ---
exec pnpm exec concurrently -n web,infer,worker -c blue,green,magenta \
  "STORAGE_DRIVER=local STORAGE_LOCAL_ROOT='$STORE' pnpm --filter @dz/web dev" \
  "cd services/inference && STORAGE_DRIVER=local STORAGE_LOCAL_ROOT='$STORE' INFERENCE_CALLBACK_TOKEN='$CBTOKEN' uv run uvicorn app.main:app --reload --port 8000" \
  "pnpm run worker"
