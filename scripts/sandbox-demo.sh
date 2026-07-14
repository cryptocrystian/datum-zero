#!/usr/bin/env bash
#
# M2-8 — drive a real capture through the running local sandbox, end to end:
#   upload → session-inference queue → worker → inference → callback → Anomaly → the Validation Queue.
# Uses the M2-7c EXIF-bearing radiometric TIFF fixture (deterministic, license-free). Approve the
# resulting anomaly in the cockpit queue to fire the outbox.
#
set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE="apps/web/e2e/fixtures/geotagged_radiometric.tiff"
ORG="00000000-0000-0000-0000-000000000001"
WEB="${SANDBOX_WEB_URL:-http://localhost:3000}"

# INGEST_API_TOKEN from .env (falls back to the local dev default).
TOKEN="$(grep -E '^INGEST_API_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
: "${TOKEN:=local_dev_ingest_token}"

if ! curl -sfo /dev/null "${WEB}/api/health"; then
  echo "The sandbox web isn't up at ${WEB}. Run 'make sandbox' (or 'pnpm sandbox') first." >&2
  exit 1
fi

echo "→ uploading a real EXIF radiometric capture (verified airframe DZ-THERMAL-0001)…"
curl -sS -X POST "${WEB}/api/v1/ingestion/upload" \
  -H "authorization: Bearer ${TOKEN}" \
  -F "modality=DRONE_THERMAL" \
  -F "airframeSerial=DZ-THERMAL-0001" \
  -F "organizationId=${ORG}" \
  -F "capturedAt=2026-07-05T18:00:00Z" \
  -F "file=@${FIXTURE};type=image/tiff" \
  | (python3 -m json.tool 2>/dev/null || cat)

cat <<'NEXT'

The capture is now flowing through the REAL trigger: queue → worker → inference → callback.
In the cockpit (signed in as admin@lighthouse-solar.example), open the Validation Queue —
a new Anomaly (real ΔT, IEC category) appears within a few seconds. Approve it to fire the outbox.
NEXT
