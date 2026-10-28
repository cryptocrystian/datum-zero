# CR-42 — Capture-source generalization (drone → any capture agent)

**Status: MERGED to canon 2026-10-28** — now in `docs/PRD-Corrections-Log.md` (CR-42) and `MANIFEST.md`
(v1.6.0: §1 capture clause, §4 agent-agnostic bullet, §7 compliance-profiles bullet, §9 index). Decision is
locked; implementation is demand-gated (CR-14) — build with/just before the first Ring-2 deal. This file is
retained as the extended rationale + the schema sketch + the CR-42a/b/c ticket split; the PRD log row is the
authoritative decision.

**Original status: DRAFT — not yet canon.** Drop-in proposal, same shape as CR-41. Merging means: (1) paste the §A
row into `docs/PRD-Corrections-Log.md`; (2) apply the §B MANIFEST edits **in the same commit**; (3) open the
§D tickets. Nothing is executed until you say so. Number: **CR-42** (CR-41 merged 2026-10-27).

**One-line decision:** generalize the UAV-specific field-logistics cluster (`Pilot` / `PilotHardware` /
aviation `PilotInsurance` / `MissionAssignment`) into a **capture-agent + pluggable compliance-profile**
abstraction, and add an **autonomous ingestion path**, so the platform ingests from any drone, ground robot,
or fixed sensor without a core change. **Additive** — the spine is already modality-neutral; this is the
capture-side analogue of M2-PREP's provably-additive delivery seam. Implementation of non-drone agents/
profiles stays **demand-driven (CR-14)**.

> **Why this is additive, not a rewrite (the code already agrees):** the value engine
> (`Asset`/`Anomaly`/`RuleSet`/`WorkOrderDispatch`/`Integration`/`CaptureQualityEvent`) carries zero drone
> assumptions; `CaptureModality` already enumerates non-drone sources; `IngestionSession.pilotOrNodeId` is
> explicitly "Pilot.id **or IoT unit UUID**"; `RadiometricPort` is a format-sniffing decoder registry. The
> only UAV coupling is the field-logistics cluster this CR generalizes.

---

## A. Drop-in row for `docs/PRD-Corrections-Log.md`

> Paste as a single table row after CR-41. (Rendered across lines for review; it is one row.)

| **CR-42** ✅ *(non-drone profiles 🔎 demand-gated)* | **Capture-source generalization — `CaptureAgent` + `CapturePlatform` + a pluggable compliance-profile seam + an autonomous ingestion path.** The field-logistics cluster is generalized so capture can originate from a human-piloted drone, an autonomous drone/dock, a ground/legged robot, or a fixed sensor, behind one seam. **(1) `Pilot` → `CaptureAgent`** with an `agentKind` enum `{ HUMAN_PILOT, AUTONOMOUS_DRONE, GROUND_ROBOT, FIXED_SENSOR }`; the human-pilot fields (`part107LicenseNum`, `licenseExpiry`, `tier`, `stripeConnectId` payout — CR-03/08) become attributes of the `HUMAN_PILOT` profile, null for autonomous agents. **(2) `PilotHardware` → `CapturePlatform`** (`aircraftModel` → `platformModel`, `+ platformClass`); the NDAA/Blue-UAS airframe fields (`ndaaVerified`, `approvedListRef`, `remoteIdSerial`, serial-match — CR-11) stay, now scoped as the **aviation** compliance module, not a universal requirement. **(3) Compliance-profile seam (`CompliancePort`).** Aviation insurance (CR-02/09/10/33) + NDAA airframe verification (CR-11) become ONE pluggable profile `AVIATION_PART107_NDAA`; a ground robot / fixed sensor resolves to a different (often lighter or null) profile. The **fail-closed dispatch gate (CR-33)** is generalized from "aviation coverage verified" to "the applicable compliance profile for this capture's modality is satisfied" — evaluated through the seam, never hardcoded to aviation; each failed dimension still yields an evidence-framed reason (CR-12). **(4) Autonomous ingestion path.** A scheduled/triggered autonomous capture (robot/dock) binds an `IngestionSession` to a `CapturePlatform` + its compliance profile directly, with **no human `MissionAssignment`**; `MissionAssignment` (pilot dispatch + payout) remains the `HUMAN_PILOT` path. **Additive + backward-compatible:** existing rows map to `CaptureAgent{agentKind: HUMAN_PILOT}` + the `AVIATION_PART107_NDAA` profile; the solar-drone beachhead is unchanged; migrations are additive (new migration, CR-27 pattern; existing migrations immutable). **Never-bind preserved (CR-03):** the compliance seam verifies proof only — no profile binds, collects, or resells; the CR-33 never-bind guardrail holds across all profiles. **Demand-driven (CR-14):** build the seam + the `AVIATION` profile (current behavior) now; implement non-drone `agentKind`s and non-aviation profiles when a real deal pulls them. **Honest consequence (on the record):** the pilot-marketplace + aviation-insurance machinery (CR-01–CR-10) is hereby scoped as a **beachhead / human-pilot module, not a platform pillar**; its relative weight **declines** as capture autonomates (autonomous capture has no Part 107 pilot and no aviation policy) — it is not deepened speculatively. **Open (🔎):** the concrete non-aviation profiles, the `agentKind` taxonomy beyond the four seeds, and robot platform/decoder onboarding are demand-gated, not specified here. | The moat is verify → route → audit, which is modality-agnostic, and the spine already is; the only UAV coupling is the field-logistics cluster, so generalizing it behind a compliance-profile seam turns the robotics/autonomous expansion into additive config rather than a fork — the same guarantee M2-PREP gave the delivery side (CR-21). Hardcoding aviation gating would either fail-open on autonomous captures (no pilot/policy to verify) or block valid ones; a per-modality profile keeps the fail-closed property honest (Commandment 5). Scoping the pilot/insurance rails as a beachhead module (not a pillar) matches the market reality that capture is autonomating (Spot/ANYmal, drone-in-a-box) and keeps CR-14's demand-driven discipline from over-investing in a declining surface. |

---

## B. MANIFEST changes required (same commit)

**Changelog (bump to 1.6.0), add at the top:**

> **Changelog — 1.6.0:** index CR-42 (capture-source generalization — `CaptureAgent`/`CapturePlatform` +
> pluggable compliance-profile seam + autonomous ingestion path; additive, non-drone profiles demand-gated).
> Generalizes the CR-11 verified-airframe language and the CR-10/CR-33 insurance gating to a per-modality
> compliance profile. No commandment change.

**§1 "What we are building"** — adjust the capture clause from drone-specific to source-agnostic, e.g.:
> Reality capture (**any drone, ground/legged robot, or fixed sensor** — thermal/RGB, 360°, IoT) is
> validated on-site, analyzed against standards-based tolerances, reviewed by a human, and emitted as an
> evidence-framed work order…

**§4 Data model principles** — add a bullet:
> - **Capture is agent-agnostic (CR-42).** `CaptureAgent` (human pilot *or* autonomous system, by
>   `agentKind`) + `CapturePlatform` + a pluggable **compliance profile**; aviation insurance + NDAA
>   airframe verification are the `AVIATION_PART107_NDAA` profile, not a universal gate. The dispatch gate
>   (CR-33) evaluates the applicable profile per modality. The pilot-marketplace + aviation-insurance rails
>   are a beachhead/human-pilot module (CR-01–CR-10), demand-driven beyond it (CR-14).

**§7 Compliance, risk & security rules** — generalize the insurance + NDAA bullets to read "the applicable
compliance profile for the capture modality," with aviation as the default profile for human-piloted drones.

**§9 Decision inheritance** — extend rows: `Infield Validator / NDAA / Remote ID | CR-11, CR-42` and
`Insurance provider / model / verification | CR-01, CR-03, CR-04, CR-10, CR-42`; add
`Capture-source generalization | CR-42`.

**No commandment change.** Commandment 5 (fail closed), 6 (insurance referral-only / never bind), and 1
(headless) are preserved — the seam keeps fail-closed + never-bind across every profile.

---

## C. Schema sketch (additive migration)

```prisma
enum AgentKind { HUMAN_PILOT  AUTONOMOUS_DRONE  GROUND_ROBOT  FIXED_SENSOR }

// Pilot → CaptureAgent (additive: add agentKind; human-pilot fields become HUMAN_PILOT-only, nullable)
model CaptureAgent {
  id             String   @id @default(uuid())
  organizationId String?  // null = Datum Zero marketplace pool (human pilots only)
  agentKind      AgentKind @default(HUMAN_PILOT)
  // --- HUMAN_PILOT profile (null for autonomous agents) ---
  firstName         String?
  lastName          String?
  email             String?  @unique
  part107LicenseNum String?
  licenseExpiry     DateTime?
  tier              PilotTier?
  stripeConnectId   String?  // payout ONLY (CR-03)
  platforms  CapturePlatform[]
  sessions   IngestionSession[]   // autonomous agents bind sessions directly (no MissionAssignment)
  missions   MissionAssignment[]  // HUMAN_PILOT path only
  insurance  PilotInsurance[]
}

// PilotHardware → CapturePlatform
model CapturePlatform {
  id             String  @id @default(uuid())
  captureAgentId String
  platformModel  String  // was aircraftModel
  platformClass  String? // e.g. QUADCOPTER | QUADRUPED | FIXED_MAST
  sensorType     CaptureModality
  serialNumber   String
  // --- AVIATION_PART107_NDAA compliance module (CR-11) ---
  remoteIdSerial  String?
  ndaaVerified    Boolean  @default(false)
  approvedListRef String?
  sessions IngestionSession[]
}

// Compliance profile resolved via a CompliancePort seam (code, not a single column):
//   verifyComplianceForDispatch(session) -> resolve profile by modality/agentKind -> verify -> fail closed.
//   AVIATION_PART107_NDAA = today's verifyCoverage (CR-33) + NDAA airframe match (CR-11), unchanged.
```

Existing drone/pilot rows migrate to `CaptureAgent{agentKind: HUMAN_PILOT}` + the aviation profile — no
behavior change. `IngestionSession.pilotOrNodeId` is already generic; it now references a `CaptureAgent`.

---

## D. Sequencing & guardrails (one guardrail + one test per ticket)

A platform track (promote per the M2/M3 drift-control format — not a re-baseline of M2-1…M2-7):

- **CR-42a** — Rename/abstract `Pilot`→`CaptureAgent`, `PilotHardware`→`CapturePlatform` (+ `agentKind`,
  additive migration, existing rows → `HUMAN_PILOT`) + introduce the `CompliancePort` seam with
  `AVIATION_PART107_NDAA` = **current behavior** (pure refactor behind the seam; CR-11 + CR-33 unchanged).
  *Guardrail:* the dispatch gate resolves the compliance profile through the seam — no hardcoded aviation
  check outside the `AVIATION` profile; the existing drone DoD e2e stays green (backward compat).
- **CR-42b** — Autonomous ingestion path (`IngestionSession` binds `CapturePlatform` + profile directly,
  no `MissionAssignment`). *Guardrail:* an autonomous session with a satisfied (or null) profile dispatches;
  one with an unsatisfied applicable profile fails closed with an evidence-framed reason.
- **CR-42c** — First non-aviation compliance profile + non-drone `agentKind` (demand-gated — when a real
  ground-robot/autonomous deal lands). *Guardrail:* never-bind holds across profiles (CR-03); no profile
  introduces a premium-collection/binding path.

---

## E. How to merge

1. Paste §A into `docs/PRD-Corrections-Log.md` after CR-41.
2. Apply §B to `MANIFEST.md` (changelog bump to 1.6.0 + §1/§4/§7 generalizations + §9 rows) **in the same
   commit**.
3. Commit: `docs(canon): CR-42 capture-source generalization (CaptureAgent + compliance-profile seam)`.
4. Open CR-42a when the capture-generalization track is promoted (before/with the first Ring-2 robot deal).

---

## F. Relationship to the GTM pass

This CR is the architectural half of the v1.0 repositioning (`GTM-STRATEGY.md`): it makes **Ring 2** (ground
robots at substations/O&G) buildable as additive config, and it operationalizes the GTM-PASS §4 finding
(the spine is already capture-agnostic; only the drone logistics cluster is coupled) and §7 correction (the
pilot/insurance rails are a beachhead module, not a pillar). It stands behind the beachhead — build the seam
with or just before the first Ring-2 deal, not now.
