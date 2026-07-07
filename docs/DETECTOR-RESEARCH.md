# Detector research — thermal anomaly classification (DET-1)

> Authored for **DET-1a**. This memo formalizes the dataset, model, and the class → IEC TS 62446-3
> mapping that the detector work is built on. It records a decision that **supersedes the CR-19
> ΔT-cutoff heuristic** — see `docs/PRD-Corrections-Log.md`.

## Problem

M0-07 classified thermal detections with a **provisional ΔT cutoff** (`≥10°C → Cat 2`, `≥20°C → Cat
3`), flagged in **CR-19** as a placeholder over the IEC TS 62446-3 matrix. ΔT alone is a weak signal:
the standard classifies by thermal **pattern/signature** (single vs. multiple cells, bypass-diode
substring, full-module offline, environmental shadow/soil/vegetation), not temperature delta alone.
DET-1 replaces the cutoff with a **learned classifier** over those patterns, then maps the predicted
class to an IEC category.

Datum Zero **measures + classifies against the standard**; the client adjudicates outcomes and a human
QA gate approves every dispatch (CR-12). We **buy/fine-tune** CV rather than hand-roll detection
science (CR-10). No verdict language anywhere in the output.

## Dataset

**InfraredSolarModules** — Raptor Maps, Inc. (MIT). 20,000 single-module IR crops, 12 anomaly
classes. Fetched by `services/inference/training/prep_data.py` from the GitHub repo zip (Kaggle
mirror `marcosgabriel/infrared-solar-modules` is a fallback). The raw dataset is **not committed**; a
small per-class sample subset is committed for tests. Attribution: `app/models/NOTICE`.

Class distribution (imbalanced — 50% No-Anomaly):

| Class | n | | Class | n |
|---|---:|---|---|---:|
| No-Anomaly | 10,000 | | Shadowing | 1,056 |
| Cell | 1,877 | | Cracking | 940 |
| Vegetation | 1,639 | | Offline-Module | 827 |
| Diode | 1,499 | | Hot-Spot | 249 |
| Cell-Multi | 1,288 | | Hot-Spot-Multi | 246 |
| Soiling | 204 | | Diode-Multi | 175 |

## Model

**MobileNetV3-small** (ImageNet-pretrained, torchvision), classifier head replaced for 12 classes.
Input 64×64 (grayscale → 3-channel, ImageNet-normalized). Fixed seed (42), stratified 70/15/15
train/val/test, **sqrt inverse-frequency class weighting** (lifts minority recall without collapsing
overall accuracy on the No-Anomaly-heavy set), Adam (lr 1e-3, wd 1e-4), 8 epochs, best-val
checkpoint. Exported to `thermal-classifier-v1.onnx` and served via **onnxruntime** (no PyTorch at
serve time). Metrics: `services/inference/training/metrics.{json,md}`.

## Class → IEC TS 62446-3 mapping (this memo's table)

Each predicted class maps to an IEC TS 62446-3 abnormality **category** (1/2/3), a maintenance
**priority**, and an evidence-framed condition. Implemented as a pure, tested module,
`app/iec_mapping.py`.

| Class | IEC category | Priority | Environmental | Condition |
|---|:---:|---|:---:|---|
| No-Anomaly | 1 | MONITOR | – | Nominal — no thermal anomaly detected |
| Soiling | 1 | MONITOR | yes | Surface contamination; clean at next scheduled maintenance |
| Shadowing | 1 | MONITOR | yes | External obstruction; evaluate site layout |
| Vegetation | 1 | MONITOR | yes | Vegetation encroachment; schedule vegetation management |
| Cracking | 2 | SCHEDULED | no | Module cracking; inspect and monitor for progression |
| Cell | 2 | SCHEDULED | no | Single hot cell; investigate at next scheduled maintenance |
| Hot-Spot | 2 | SCHEDULED | no | Single hot spot; investigate at next scheduled maintenance |
| Cell-Multi | 3 | PROMPT | no | Multiple hot cells; prompt corrective action recommended |
| Hot-Spot-Multi | 3 | PROMPT | no | Multiple hot spots; prompt corrective action recommended |
| Diode | 3 | PROMPT | no | Bypass diode activated (substring offline); prompt corrective action |
| Diode-Multi | 3 | PROMPT | no | Multiple bypass diodes; prompt corrective action recommended |
| Offline-Module | 3 | PROMPT | no | Module offline; prompt corrective action recommended |

**Category intent** (IEC TS 62446-3): **1** monitor / no immediate action; **2** correct at next
scheduled maintenance; **3** prompt corrective action.

## Provisional status (CR-19 continues to apply to the assignments)

The classification **method** now moves from ΔT-cutoff to learned-class-based. The **category
assignments above remain provisional** pending the standard's full matrix + field calibration
(e.g. single-diode severity, and category by measured ΔT within a class). They are configurable
defaults and must be validated before any client-facing classification — the same posture CR-19 set.

## Serving + guardrails

Serving loads the committed ONNX via onnxruntime; **CI never retrains** (it installs serving deps
only and runs a deterministic smoke test against the committed weights). Training deps are the
`[training]` extra. Enforced by `tests/guardrails/test_detector_model.py`.

## Citation

Millendorf, M., Obropta, E., & Vadhavkar, N. (2020). *Infrared Solar Module Dataset for Anomaly
Detection.* ICLR 2020, AI for Earth Sciences Workshop.
