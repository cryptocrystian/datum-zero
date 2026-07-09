# Datum Zero — M2 Execution Plan

**Status:** active. **Predecessor:** M2-PREP (integration adapter roadmap + unified-envelope reconciliation, CR-21) — closed. **Method:** plan the sequence, detail the head.

## 1. Guiding principle — harden the credibility chain, in order
The product is a verification layer: physical capture → **measurement** → classification → evidence framing → delivery. M0/M1 built the spine; M2-PREP made **delivery** sound (one internal envelope, one output contract, provably additive to enterprise). M2 walks *back up* the chain and hardens the upstream layers so every downstream claim inherits real integrity. Order is deliberate: a "+18.4°C delta vs. median" is only defensible evidence if it is a **true radiometric temperature delta** from a **quality-screened capture**. Posture: **independent execution**, **code to published standards/formats**, **generic adapter is the product**, **native adapters demand-driven** (CR-14).

## 2. Drift controls (every M2 ticket)
- Plan the sequence, detail the head; no speculative deep specs.
- Standards/format-anchored (DJI R-JPEG / FLIR radiometric-JPEG, IEC TS 62446-3, NOAA SPA, ACI 117).
- Reconcile with reality: inspect the in-repo implementation, flag mismatches.
- Non-negotiables: evidence not verdict (CR-12); fail-closed; tenant-scoped by `organizationId`; secrets in vault; 100% human QA gate; "high ΔT escalates, never downgrades."
- One guardrail + one test per ticket; new decisions get a new CR in the same commit.

## 3. The M2 epic sequence
| Epic | Summary | Depends on |
|---|---|---|
| **M2-1 — Radiometric Integrity** *(HEAD, §4)* | True per-pixel temperature; channel preserved end-to-end; real ΔT vs. local median; Validator asserts channel, fail-closed on colorized-only. | Buildable now |
| **M2-2 — Detector accuracy + IEC validation (CR-19 closure)** | Real radiometry + more open data; validate classification vs. IEC TS 62446-3; thermal signature, not ΔT alone. | M2-1 |
| **M2-3 — Infield Validator firewall (CR-11 completion)** | NOAA glare, haversine overlap, GPS gaps, EXIF/XMP completeness + verified-airframe screening. | Partial parallel |
| **M2-4 — Insurance verification adapters (CR-01/03/10)** | SkyWatch + COI-vendor referral-only verification; coverage profile + fail-closed pre-mission. | Orthogonal |
| **Platform-hardening** *(promote as needed)* | Magic-link email; SOC 2 (Vanta/Drata); ERP/BIM registry depth (CR-13 Phase 2). | Independent |

## 4. M2-1 — Radiometric Integrity

**Manufacturer-agnostic by design.** `RadiometricPort` is a **decoder registry** that format-sniffs each capture and routes to the right decoder — the capture-side analogue of the delivery adapter registry (**ingest from any manufacturer, deliver to any system**). Adding a manufacturer = registering a decoder, never a pipeline fork.

Coverage tiers:
- **Standard/open (build now):** FLIR radiometric JPEG (`flyr`, pure-Python, EUPL-1.2, used unmodified; covers FLIR-core incl. Autel 640R, Parrot, Workswell, Yuneec); radiometric TIFF/IRG (InfiRay-core incl. Autel 640T).
- **Vendor-native (proprietary; demand-driven, CR-14):** DJI R-JPEG via DJI Thermal SDK/DIRP (dominant fleet; build now, licensed with conditions); InfiRay/Autel native SDK only if a real deal needs it.

**Buy-not-build** behind the port; never re-implement calibration. **Fail-closed on unknown/colorized:** return `NO_RADIOMETRIC_CHANNEL` — never guess a format or fabricate temperature.

**NDAA / Blue UAS fleets are mostly already covered:** the Blue UAS thermal segment standardizes on **Teledyne FLIR Boson** cores (Skydio X10D, Parrot ANAFI USA, Teal/Red Cat, Freefly) → open FLIR path; radiometric TIFF covers non-FLIR; Anzu Raptor T (DJI-licensed) → DJI decoder. Niche defense/scientific cores (Leonardo DRS, BAE, Owl AI) are demand-driven and *measured* via the M2-1f unknown-format event; the M2-3 airframe registry pre-maps airframe → core → decoder at onboarding.

**License gate cleared (vs. DJI SDK EULA, 2017-12-12):** FLIR via `flyr` (EUPL-1.2, unmodified; exiftool subprocess is an available fallback). DJI DIRP licensed for server-side processing of DJI-captured imagery with binding conditions — DJI-data-only (§3.2(f)); no modify/reverse-engineer (§3.2); **SDK binary + DJI wrapper are Confidential (§14), never committed / never open-sourced** (guardrail-enforced); distribution terms (§3.3) apply only on-prem; verify offline telemetry (§6); export + HKIAC/indemnification noted. Not legal advice; sign-off prudent before the DJI path ships, not a build blocker.

**Fixtures (no proprietary imagery committed):** FLIR — pure-function Planck gate + skippable real-sample integration; TIFF — synthetic fixture + skippable real Autel 640T sample to validate centi-Kelvin calibration; DJI — mocked DIRP boundary in CI.

### Ticket briefs
> **⚠️ As-built:** the detailed `M2-1x` hand-off tickets + the CR log are authoritative. FLIR uses `flyr`, not exiftool; M2-1b retired the CR-19 intensity proxy (CR-23); M2-1c fixed ΔT = P99 vs. median (CR-24); M2-1d persists `CaptureQualityEvent` (CR-25).
> **CR ledger:** CR-22 (M2-1a) · CR-23 (M2-1b) · CR-24 (M2-1c) · CR-25 (M2-1d).
> **Build status:** M2-1a ✔ `2615edb` · M2-1b ✔ `70cd7a6` · M2-1c ✔ `eeaa774` · M2-1d in progress · M2-1e/f pending.

- **M2-1a** — Manufacturer-agnostic decode behind `RadiometricPort` (FLIR/TIFF/DJI, sniff-routed, fail-closed). *(CR-22)*
- **M2-1b** — Route true °C into `detect()`, preserve channel, retire intensity proxy, fail-closed. *(CR-22, CR-23)*
- **M2-1c** — Real ΔT = P99(hotspot) − median(baseline ring), clamped, monotonic. *(CR-22, CR-24)*
- **M2-1d** — Persist + surface radiometric data-quality (`CaptureQualityEvent`) + Validator edge pre-check. *(CR-11, CR-22, CR-25)*
- **M2-1e** — e2e DoD across formats + demo/seed migration to radiometric fixtures + guardrails. *(CR-12, CR-22)*
- **M2-1f** — Unknown-format observability (QA event + count) to measure the decoder tail. *(CR-11, CR-22)*

### M2-1 Definition of Done
All build-now formats route via `sniff` and produce true °C + real ΔT; unknown/colorized rejected fail-closed at capture and ingestion; channel preserved end-to-end; audit shows radiometric provenance; DJI confidentiality honored; guardrails + tests green.

### CR ledger (M2-1)
**CR-22 — Radiometric integrity (manufacturer-agnostic).** Decoder registry (FLIR/TIFF/DJI); preserve raw channel; ΔT from true temperature; fail-closed on unknown/non-radiometric; FLIR via `flyr` (EUPL-1.2); DJI SDK + wrapper Confidential, never committed.
**CR-23 — Radiometric-only measurement.** Supersedes the intensity-proxy portion of CR-19; 8-bit fabricated-ΔT path removed; classification (type) and measurement (ΔT) separated; 8-bit-only fails closed; `delta_provisional` kept, always `False`.
**CR-24 — ΔT definition (locked).** ΔT = P99(hotspot) − median(baseline ring), clamped ≥ 0, rounded 0.1 °C; percentile/ring/rounding are documented `DetectorConfig` fields.
**CR-25 — Capture-quality persistence.** Radiometric fail-closed outcome persisted as session-scoped, org-scoped `CaptureQualityEvent` (own RLS migration), distinct from `Anomaly` (no dispatch path by construction); surfaced in the cockpit as a non-anomaly item with an evidence-framed reason.
**CLAUDE.md hard rule:** never commit the DJI SDK binary/source/headers or place the DJI wrapper in any open-sourced module — Confidential under DJI EULA §14.

## 5. After M2-1 closes
Promote **M2-2** to detailed tickets. Re-baseline if a real deal pulls a native adapter or enterprise requirement forward (promotes a platform-hardening track, not a core refactor — M2-PREP guaranteed additivity).
