"""
DET-1a — train + export the thermal anomaly classifier.

MobileNetV3-small over the 12 InfraredSolarModules classes. Fixed seed, stratified train/val/test
split, class-weighted loss (the dataset is 50% No-Anomaly). Emits a metrics report (held-out test
accuracy + confusion matrix) and exports the best model to ONNX for lightweight serving.

Run (in a training venv with the [training] extra):  python training/train.py
Outputs:
  app/models/thermal-classifier-v1.onnx   committed ONNX weights (served via onnxruntime)
  app/models/labels.json                   class order (matches app.iec_mapping.CLASS_LABELS)
  app/models/smoke.json                     deterministic smoke expectation for the ONNX
  training/metrics.json / metrics.md        held-out test accuracy + confusion matrix
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SERVICE_ROOT = HERE.parent
sys.path.insert(0, str(SERVICE_ROOT))  # so `import app.iec_mapping` works (pure module)

from app.iec_mapping import CLASS_LABELS  # noqa: E402  (canonical class order)

DATA_ROOT = HERE / "data" / "InfraredSolarModules"
SAMPLES_DIR = HERE / "samples"
MODEL_DIR = SERVICE_ROOT / "app" / "models"
MODEL_PATH = MODEL_DIR / "thermal-classifier-v1.onnx"

# --- hyperparameters (documented, fixed) ---
SEED = 42
IMG = 64
BATCH = 64
EPOCHS = 8
LR = 1e-3
WEIGHT_DECAY = 1e-4
VAL_FRACTION = 0.15
TEST_FRACTION = 0.15
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

LABEL_INDEX = {c: i for i, c in enumerate(CLASS_LABELS)}


def preprocess_gray(arr_u8: np.ndarray) -> np.ndarray:
    """uint8 HxW grayscale -> normalized float32 3xHxW (SAME transform serving uses, app/classifier)."""
    g = arr_u8.astype(np.float32) / 255.0
    img = np.stack([g, g, g], axis=0)  # 3xHxW
    return (img - IMAGENET_MEAN[:, None, None]) / IMAGENET_STD[:, None, None]


def load_dataset() -> tuple[np.ndarray, np.ndarray]:
    with open(DATA_ROOT / "module_metadata.json") as f:
        meta = json.load(f)
    entries = sorted(meta.values(), key=lambda e: e["image_filepath"])
    X = np.zeros((len(entries), IMG, IMG), dtype=np.uint8)
    y = np.zeros(len(entries), dtype=np.int64)
    for i, e in enumerate(entries):
        img = Image.open(DATA_ROOT / e["image_filepath"]).convert("L").resize((IMG, IMG), Image.BILINEAR)
        X[i] = np.asarray(img, dtype=np.uint8)
        y[i] = LABEL_INDEX[e["anomaly_class"]]
    return X, y


def main() -> int:
    import torch
    import torch.nn as nn
    import torchvision
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
    from torch.utils.data import DataLoader, Dataset

    torch.manual_seed(SEED)
    np.random.seed(SEED)
    torch.use_deterministic_algorithms(False)
    torch.set_num_threads(min(8, torch.get_num_threads() or 8))
    device = torch.device("cpu")

    print("[train] loading dataset into memory …")
    X, y = load_dataset()
    print(f"[train] {len(y):,} images, {len(CLASS_LABELS)} classes")

    idx = np.arange(len(y))
    train_idx, tmp_idx = train_test_split(
        idx, test_size=VAL_FRACTION + TEST_FRACTION, stratify=y, random_state=SEED
    )
    rel_test = TEST_FRACTION / (VAL_FRACTION + TEST_FRACTION)
    val_idx, test_idx = train_test_split(tmp_idx, test_size=rel_test, stratify=y[tmp_idx], random_state=SEED)
    print(f"[train] split: train={len(train_idx)} val={len(val_idx)} test={len(test_idx)}")

    class DS(Dataset):
        def __init__(self, idxs: np.ndarray):
            self.idxs = idxs

        def __len__(self) -> int:
            return len(self.idxs)

        def __getitem__(self, i: int):
            j = self.idxs[i]
            return torch.from_numpy(preprocess_gray(X[j])), int(y[j])

    dl_train = DataLoader(DS(train_idx), batch_size=BATCH, shuffle=True, num_workers=0)
    dl_val = DataLoader(DS(val_idx), batch_size=BATCH, num_workers=0)
    dl_test = DataLoader(DS(test_idx), batch_size=BATCH, num_workers=0)

    model = torchvision.models.mobilenet_v3_small(weights=torchvision.models.MobileNet_V3_Small_Weights.DEFAULT)
    in_f = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_f, len(CLASS_LABELS))
    model.to(device)

    counts = np.bincount(y[train_idx], minlength=len(CLASS_LABELS)).astype(np.float32)
    # sqrt inverse-frequency weighting — lifts minority-class recall without collapsing overall
    # accuracy the way full inverse-frequency does on a 50%-No-Anomaly dataset.
    class_w = np.sqrt(counts.sum() / (len(CLASS_LABELS) * np.maximum(counts, 1.0)))
    criterion = nn.CrossEntropyLoss(weight=torch.tensor(class_w, dtype=torch.float32))
    opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)

    def evaluate(dl) -> tuple[float, np.ndarray, np.ndarray]:
        model.eval()
        preds, gts = [], []
        with torch.no_grad():
            for xb, yb in dl:
                out = model(xb.to(device))
                preds.append(out.argmax(1).cpu().numpy())
                gts.append(yb.numpy())
        p, g = np.concatenate(preds), np.concatenate(gts)
        return float(accuracy_score(g, p)), p, g

    best_val, best_state = -1.0, None
    for epoch in range(1, EPOCHS + 1):
        model.train()
        t0, running = time.time(), 0.0
        for xb, yb in dl_train:
            opt.zero_grad()
            loss = criterion(model(xb.to(device)), yb.to(device))
            loss.backward()
            opt.step()
            running += loss.item() * xb.size(0)
        val_acc, _, _ = evaluate(dl_val)
        print(f"[train] epoch {epoch}/{EPOCHS}  loss={running/len(train_idx):.4f}  val_acc={val_acc:.4f}  ({time.time()-t0:.0f}s)")
        if val_acc > best_val:
            best_val = val_acc
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

    assert best_state is not None
    model.load_state_dict(best_state)

    test_acc, test_pred, test_gt = evaluate(dl_test)
    macro_f1 = float(f1_score(test_gt, test_pred, average="macro"))
    cm = confusion_matrix(test_gt, test_pred, labels=list(range(len(CLASS_LABELS))))
    print(f"[train] HELD-OUT TEST accuracy = {test_acc:.4f}  macro-F1 = {macro_f1:.4f}")

    # --- export ONNX ---
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.eval()
    dummy = torch.randn(1, 3, IMG, IMG)
    torch.onnx.export(
        model, dummy, str(MODEL_PATH),
        input_names=["input"], output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=13, dynamo=False,
    )
    print(f"[train] exported {MODEL_PATH} ({MODEL_PATH.stat().st_size/1e6:.2f} MB)")
    (MODEL_DIR / "labels.json").write_text(json.dumps({"labels": list(CLASS_LABELS), "img_size": IMG}, indent=2))

    # --- ONNX parity + smoke expectation via onnxruntime (identical to serving) ---
    import onnxruntime as ort

    sess = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    def onnx_predict(batch_u8: np.ndarray) -> np.ndarray:
        x = np.stack([preprocess_gray(a) for a in batch_u8]).astype(np.float32)
        return sess.run(None, {"input": x})[0].argmax(1)

    onnx_test_pred = onnx_predict(X[test_idx])
    onnx_acc = float(accuracy_score(test_gt, onnx_test_pred))
    print(f"[train] ONNX test accuracy = {onnx_acc:.4f} (torch {test_acc:.4f})")

    # choose a committed sample the ONNX classifies correctly for a meaningful, stable smoke test
    smoke = None
    for cls in CLASS_LABELS:
        for p in sorted((SAMPLES_DIR / cls).glob("*.jpg")):
            arr = np.asarray(Image.open(p).convert("L").resize((IMG, IMG), Image.BILINEAR), dtype=np.uint8)
            pred = int(onnx_predict(arr[None])[0])
            if CLASS_LABELS[pred] == cls:
                smoke = {"sample": f"{cls}/{p.name}", "expected_index": pred, "expected_label": cls}
                break
        if smoke:
            break
    if smoke is None:  # fallback: record whatever it predicts on the first sample (stability only)
        cls = CLASS_LABELS[0]
        p = sorted((SAMPLES_DIR / cls).glob("*.jpg"))[0]
        arr = np.asarray(Image.open(p).convert("L").resize((IMG, IMG), Image.BILINEAR), dtype=np.uint8)
        pred = int(onnx_predict(arr[None])[0])
        smoke = {"sample": f"{cls}/{p.name}", "expected_index": pred, "expected_label": CLASS_LABELS[pred]}
    (MODEL_DIR / "smoke.json").write_text(json.dumps(smoke, indent=2))
    print(f"[train] smoke expectation: {smoke}")

    # --- metrics report ---
    metrics = {
        "model": "mobilenet_v3_small",
        "model_version": "thermal-classifier-v1",
        "seed": SEED,
        "img_size": IMG,
        "epochs": EPOCHS,
        "batch_size": BATCH,
        "lr": LR,
        "weight_decay": WEIGHT_DECAY,
        "split": {"train": int(len(train_idx)), "val": int(len(val_idx)), "test": int(len(test_idx))},
        "best_val_accuracy": round(best_val, 4),
        "test_accuracy": round(test_acc, 4),
        "onnx_test_accuracy": round(onnx_acc, 4),
        "test_macro_f1": round(macro_f1, 4),
        "labels": list(CLASS_LABELS),
        "confusion_matrix": cm.tolist(),
    }
    (HERE / "metrics.json").write_text(json.dumps(metrics, indent=2))

    lines = [
        "# Thermal anomaly classifier — metrics (DET-1a)",
        "",
        f"- Model: MobileNetV3-small · seed {SEED} · {EPOCHS} epochs · img {IMG}x{IMG}",
        f"- Split: train {len(train_idx)} / val {len(val_idx)} / test {len(test_idx)} (stratified)",
        f"- **Held-out test accuracy: {test_acc:.4f}** · macro-F1 {macro_f1:.4f} · ONNX parity {onnx_acc:.4f}",
        "",
        "## Confusion matrix (rows = true, cols = predicted)",
        "",
        "| true \\ pred | " + " | ".join(c[:6] for c in CLASS_LABELS) + " |",
        "|" + "---|" * (len(CLASS_LABELS) + 1),
    ]
    for i, c in enumerate(CLASS_LABELS):
        lines.append(f"| {c} | " + " | ".join(str(int(v)) for v in cm[i]) + " |")
    (HERE / "metrics.md").write_text("\n".join(lines) + "\n")
    print(f"[train] wrote metrics.json / metrics.md · test_accuracy={test_acc:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
