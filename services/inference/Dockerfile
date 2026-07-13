# syntax=docker/dockerfile:1.7
# FastAPI inference service. Bakes the ONNX model (ours, trained on MIT-licensed data — fine to ship).
# The Confidential DJI Thermal SDK is NEVER baked (DJI EULA §14, CR-22): the DJI decoder loads it at
# runtime from $DJI_THERMAL_SDK_PATH (mounted / provided at deploy), and fails closed (DjiSdkUnavailable)
# when absent — the image still builds, boots, and serves the FLIR/TIFF decoders. Runs NON-ROOT (M2-6a).
ARG PYTHON_VERSION=3.12-slim-bookworm

# ---- build: resolve serving deps into a venv with uv (frozen lock; no dev, no training extra) ----
FROM python:${PYTHON_VERSION} AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /svc
COPY services/inference/pyproject.toml services/inference/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project
# App + the baked ONNX model (app/models/thermal-classifier-v1.onnx). NO DJI SDK — dockerignored.
COPY services/inference/app ./app

# ---- runtime: slim, non-root, model baked ----
FROM python:${PYTHON_VERSION} AS inference
ENV PYTHONUNBUFFERED=1 PATH="/svc/.venv/bin:$PATH"
WORKDIR /svc
RUN groupadd --system --gid 1001 infer && useradd --system --uid 1001 --gid infer infer
COPY --from=build --chown=infer:infer /svc /svc
USER infer
EXPOSE 8000
# Health via the stdlib (no curl) so the runtime stays minimal.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
