# Thermal anomaly classifier — training (DET-1a)

Reproducible pipeline for `thermal-classifier-v1` (MobileNetV3-small over the 12
InfraredSolarModules classes). **CI never runs this** — serving loads the committed
`app/models/thermal-classifier-v1.onnx` via onnxruntime. Training deps are the `[training]` extra
(PyTorch etc.), installed separately on the CPU torch index.

## Run

```bash
cd services/inference

# 1) training-only deps (CPU torch — kept out of the serving runtime)
uv venv .venv-training --python 3.12
uv pip install --python .venv-training/bin/python torch torchvision --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv-training/bin/python onnx scikit-learn pillow numpy onnxruntime

# 2) fetch + extract the dataset (raw 20k images are gitignored; a small sample subset is committed)
.venv-training/bin/python training/prep_data.py

# 3) train + export ONNX + metrics
.venv-training/bin/python training/train.py
```

## Data

- **InfraredSolarModules** (Raptor Maps, MIT) — 20,000 thermal module crops, 12 classes. Fetched by
  `prep_data.py` from the GitHub repo zip; Kaggle mirror `marcosgabriel/infrared-solar-modules` is a
  fallback. The raw dataset is **not committed** (`data/` is gitignored). See `app/models/NOTICE`.
- `samples/` — a few images per class, committed for the deterministic smoke test.

## Hyperparameters (fixed)

seed 42 · MobileNetV3-small (ImageNet-pretrained) · input 64×64 (grayscale→3ch, ImageNet norm) ·
stratified 70/15/15 train/val/test · class-weighted cross-entropy (dataset is 50% No-Anomaly) ·
Adam lr 1e-3, weight-decay 1e-4 · 8 epochs · best-val checkpoint.

## Outputs

- `app/models/thermal-classifier-v1.onnx` — committed weights (served via onnxruntime).
- `app/models/labels.json` / `smoke.json` — class order + deterministic smoke expectation.
- `metrics.json` / `metrics.md` — held-out test accuracy + confusion matrix.
