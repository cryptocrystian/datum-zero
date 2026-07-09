# IEC TS 62446-3 — grounded category mapping (verification sheet)

**Source:** IEC TS 62446-3 **Committee Draft (82/1073)**, licensed copy. Every threshold below is
**PROVISIONAL, pending line-by-line confirmation against the published IEC TS 62446-3:2017.** Code and
payloads stamp provenance `"IEC TS 62446-3 (CD / pending verification)"` — **never** `:2017`.
Implemented in [`services/inference/app/iec_mapping.py`](../services/inference/app/iec_mapping.py)
(`iec_category`, `_CATEGORY_RULES`); tested in `services/inference/tests/test_iec_category.py`.

`[CD]` = read from Annex C · `[CD-derived]` = extrapolated from an Annex C row · `[PROV]` = no clean
Annex C value, provisional pending grounding.

## Normalization (§7.4)
`ΔT_norm = ΔT_measured · (1000 / G_measured) ^ x`, applied **before** category assignment.
Extent exponent `x`: **1.6 point** (sub-cell hot-spot, transfer resistance, heated junction box) ·
**1.0 extended** (whole cell, substring, whole module, soiling). Missing `G` → `normalization =
"UNAVAILABLE"`, raw ΔT carried, category provisional (never fabricated). The ≥600 W/m² ingestion gate
(M2-2b) bounds amplification to ≤ ~2.3×.

## 12-class → Annex C category map (on ΔT_norm)
| Model class | Annex C abnormality | Extent (x) | Category logic | Grounding | Verify against CD |
|---|---|---|---|---|---|
| `No-Anomaly` | — | — | no finding | [CD] | nominal — no abnormality |
| `Cell` | Single cell ΔT (ex.7) | extended (1.0) | <10 K → Cat 1; 10–40 K → Cat 2; >40 K → Cat 3 | [CD] | ex.7 band; **whole cell = extended, not point** |
| `Cell-Multi` | Multiple single-cell / mismatch | extended (1.0) | as `Cell` (worst cell) | [CD-derived] | escalate on worst cell |
| `Hot-Spot` | Point hot source (§7.4) | **point (1.6)** | <10 → Cat 1; 10–40 → Cat 2; >40 → Cat 3 | **[PROV]** | Annex C has no discrete hot-spot row — thresholds provisional |
| `Hot-Spot-Multi` | Multiple point sources | point (1.6) | as `Hot-Spot` | **[PROV]** | as above |
| `Diode` | 1× substring open (ex.5) | extended (1.0) | ≥2 K → Cat 2 (capped); <2 → Cat 1 | [CD] | Cat 3 needs serial-arc (backside, not front-visible) → cap at Cat 2 |
| `Diode-Multi` | 2× substrings open (ex.6) | extended (1.0) | ≥2 K → Cat 2; <2 → Cat 1 | [CD] | ex.6 (Cat 2–3); front-visible → Cat 2 |
| `Offline-Module` | Module open/short (ex.1,2) | extended (1.0) | ≥2 K → Cat 2; <2 → Cat 1 | [CD] | uniform module heating |
| `Cracking` | Broken glass / cell crack (ex.3,9) | extended (1.0) | **Cat 3 CANDIDATE + `requiresSafetyReview`** | [CD] | broken glass = isolation/shock Cat 3, but benign micro-crack ≠ Cat 3 → **never silent**; human confirms |
| `Soiling` | Cells shaded by dirt (ex.8) | extended (1.0) | <10 → Cat 1 (rain-washable); ≥10 → Cat 2 | [PROV] | Cat 2 threshold provisional — single-frame persistence unknown |
| `Vegetation` | Persistent shading (ex.8 analog) | extended (1.0) | <10 → Cat 1 (transient); ≥10 → Cat 2 | **[PROV]** | persistent → maintenance |
| `Shadowing` | Operational, not a fault | — | **no category → data-quality** | [CD] | §5.1 shading-free inspection; invalid capture condition (reroute is M2-2b) |

## Corrections baked in (vs. prior drafts)
1. **`Cell` is extended / x=1.0**; only `Hot-Spot` is point / x=1.6.
2. **`Shadowing` → data-quality**, not a Category (flagged here; rerouted in M2-2b).
3. **`Cracking` → mandatory human safety review**, never a silent Category 3.

## CR-15 boundary
`iec_mapping` emits the **objective IEC Category only** — never `MONITOR/SCHEDULED/PROMPT`. Priority is
client policy owned by the RuleSet, applied downstream over the Category (RuleSet category policy +
`served_priority` retirement = **M2-2c**).

## Open `[PROV]` items awaiting grounding
- `Hot-Spot` / `Hot-Spot-Multi` category bands (no discrete Annex C hot-spot row).
- `Vegetation` transient/persistent split; `Soiling` Cat 2 threshold.
- The `<lower-bound → Cat 1` floor for every fault class (a natural low-severity floor, not an explicit
  Annex C row).
