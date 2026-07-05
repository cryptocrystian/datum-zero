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
