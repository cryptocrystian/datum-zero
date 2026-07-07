# Thermal anomaly classifier — metrics (DET-1a)

- Model: MobileNetV3-small · seed 42 · 8 epochs · img 64x64
- Split: train 14000 / val 3000 / test 3000 (stratified)
- **Held-out test accuracy: 0.7420** · macro-F1 0.5735 · ONNX parity 0.7420

## Confusion matrix (rows = true, cols = predicted)

| true \ pred | Cell | Cell-M | Cracki | Diode | Diode- | Hot-Sp | Hot-Sp | No-Ano | Offlin | Shadow | Soilin | Vegeta |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cell | 183 | 24 | 4 | 4 | 2 | 4 | 1 | 16 | 2 | 9 | 8 | 24 |
| Cell-Multi | 54 | 56 | 22 | 6 | 1 | 1 | 0 | 5 | 4 | 18 | 3 | 23 |
| Cracking | 14 | 13 | 90 | 1 | 2 | 0 | 4 | 4 | 0 | 8 | 3 | 2 |
| Diode | 0 | 1 | 0 | 196 | 11 | 0 | 0 | 10 | 2 | 3 | 0 | 2 |
| Diode-Multi | 0 | 0 | 0 | 1 | 23 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| Hot-Spot | 1 | 0 | 1 | 2 | 0 | 21 | 5 | 5 | 0 | 2 | 0 | 0 |
| Hot-Spot-Multi | 2 | 0 | 0 | 0 | 0 | 4 | 22 | 8 | 0 | 0 | 1 | 0 |
| No-Anomaly | 9 | 5 | 1 | 25 | 7 | 16 | 3 | 1351 | 26 | 46 | 1 | 10 |
| Offline-Module | 5 | 1 | 1 | 5 | 2 | 0 | 2 | 48 | 53 | 6 | 0 | 1 |
| Shadowing | 10 | 7 | 7 | 4 | 2 | 0 | 1 | 38 | 3 | 85 | 0 | 2 |
| Soiling | 4 | 1 | 3 | 0 | 0 | 0 | 10 | 2 | 0 | 0 | 10 | 1 |
| Vegetation | 60 | 7 | 5 | 1 | 0 | 1 | 1 | 23 | 5 | 7 | 0 | 136 |
