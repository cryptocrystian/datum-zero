# services/inference

FastAPI CV + spatial engine. **Detect + classify only — never adjudicate (CR-12).**

## Dev
```bash
cd services/inference
uv venv && uv sync           # or: python -m venv .venv && pip install -e .
uv run uvicorn app.main:app --reload --port 8000
# health: http://localhost:8000/health
```

Called from the repo root via `pnpm dev:infer`. Detection lands in ticket M0-05.

## Radiometric decode (M2-1a)
`app/radiometric` (`RadiometricPort`) turns a radiometric capture into a per-pixel °C array, routed by
detected format (FLIR R-JPEG via `flyr`; radiometric TIFF; DJI R-JPEG). Not wired into the live pipeline yet.

**DJI Thermal SDK — Confidential (DJI EULA §14, CR-22).** The committed DJI decoder is glue only. Vendor
the DJI Thermal SDK + its wrapper module locally (NEVER commit them — gitignored + guardrail-enforced) and
point `DJI_THERMAL_SDK_PATH` at it. Absent (CI/OSS) → the DJI path fails closed; tests mock the DIRP boundary.
