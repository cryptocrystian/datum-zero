# Datum Zero — GTM Pass & Course Decision (October 2026)

**Status:** Decision memo — for founder review. **Not yet canon.** Supersedes `GTM-STRATEGY.md` v0.1 as the
active strategy document *if* its recommendations are accepted; any change it implies to a locked decision
(MANIFEST commandment or a CR) is a **proposed amendment**, not an executed one — those are drafted and
committed separately per CLAUDE.md.

**Author's note on evidence.** Every external claim below carries a confidence grade — **[HIGH]**,
**[MED]**, **[LOW]** — from a three-thread market scan (drone/solar competitive landscape; robotics /
physical-AI; CMMS-EAM + buyer + federal). Most vendor scale/funding/market-size numbers are
self-reported or aggregator-sourced and disagree with each other; they are directional, not decision-grade.
Four claims the current GTM draft treats as settled are in fact **unproven** and are called out in §6 —
they are the things to validate before we spend heavily against them.

---

## 1. The decision (read this first)

**Stay the course on the architecture. Course-correct the identity, the sequencing, and three load-bearing
assumptions.**

Datum Zero was built as a *headless verification-and-routing layer* whose stated moat is
"adjudication + audit + routing + the registry — not the CV detector, not the drone" (MANIFEST
Commandment 10). The market scan says that instinct is right and, if anything, **under-claimed**: the
precise combination Datum Zero already implements is a genuine, currently-unowned category. But the product
is dressed as a *drone solar-inspection tool*, and that costume now caps its ceiling, understates its moat,
and points it at the one segment (US utility-scale solar) whose near-term growth just got cut.

The correction is not a rebuild. The core data model is **already capture-agnostic** (§4), so expanding
beyond UAVs into ground robots and autonomous systems — your instinct — is an *additive generalization of
the capture source*, the same move M2-PREP already proved additive on the delivery side. What changes is
what we **call** ourselves, which buyers we lead with, and which three beliefs we test before building more.

| | Verdict |
|---|---|
| **Core architecture** (verify → classify → human-QA → evidence-frame → route → audit) | **STAY.** It is the unclaimed wedge. Do not touch the spine. |
| **Evidence-not-verdict + immutable audit trail** (CR-12) | **STAY — and promote it.** It was a liability hedge; the EU AI Act just made it a *demand driver*. |
| **Generic-adapter-first routing** (CR-05/14) | **STAY.** Enterprise CMMS/EAM all expose inbound work-order APIs; the outbox pattern fits. [HIGH] |
| **Solar-thermal-via-drone beachhead** (CR-07) | **STAY as the *first proof*, drop as the *identity*.** It is nearly built; finish it. But it is a wedge, not the company. |
| **Category / positioning** | **CORRECT.** "Drone solar inspection" → "the verification & provenance layer for autonomous physical-asset inspection" (sensor- and robot-agnostic). |
| **Capture-source abstraction** (`Pilot`/`PilotHardware`/aviation insurance) | **CORRECT.** Generalize to a pluggable operator/platform *compliance profile*; aviation/NDAA becomes one module, not the spine. |
| **Pilot marketplace + aviation-insurance rails** (CR-01–CR-10) | **CORRECT the weighting.** Beachhead-only module for *human-piloted* drone services. Its relative importance *declines* as capture autonomates. Do not deepen speculatively. |
| **Three assumptions** (standards-as-requirement; last-mile cost; WTP for "verified") | **VALIDATE before heavy build.** Currently asserted, not evidenced. |

---

## 2. What we are (sharpened) and why it is defensible

Datum Zero is the **neutral verification, routing, and provenance layer** that sits **above the capture
hardware** (any drone, any ground robot, any fixed sensor) and **below the system of record** (any
CMMS/EAM). It turns reality-capture into a **human-verified, standards-classified, evidence-framed, fully
provenanced work order** delivered into the system the client already runs.

The moat is **three things no competitor holds together**:

1. **Neutrality** — agnostic across *both* capture vendors *and* destination systems.
2. **Defensible output** — human-QA'd, classified to a named standard, framed as evidence (never a verdict),
   with an immutable audit trail reconstructing every determination.
3. **The routed last mile** — into the client's existing stack, not another dashboard to babysit.

Why that is durable (from the competitive scan, §5): the hardware vendors **cannot** credibly be neutral —
they compete with each other — and the CMMS vendors **don't** do standards-anchored, multi-vendor-capture
verification. The one axis each competitor is strong on is the axis that disqualifies it from the other two.

---

## 3. The strategic opening: the wedge is unclaimed, and the clock is running

**No single player owns the full stack** — *sensor/robot-agnostic + human-QA + standards-classification +
evidence-framed work-order routing + provenance/audit, neutral across both hardware AND CMMS.* The nearest
approximations each fail exactly one axis: **[MED]**

- **Energy Robotics** (Darmstadt; $13.5M Series A, Oct 2025; Shell, BP, Repsol, BASF, E.ON) — genuinely
  hardware-agnostic fleet orchestration across 8+ OEM robots and drones. **But** it stops at capture +
  mission control + analytics; no human-QA'd, standards-classified, *verified work-order routing*, and it
  does not emphasize provenance/audit. **This is the competitor to watch — it is moving up toward us from
  the capture side.**
- **Siemens Aerosophia** — *does* push inspection findings via API into CMMS/EAM/SAP (the routing piece).
  **But** Siemens-owned and Siemens-ecosystem-locked → not neutral.
- **Gecko Robotics** (Cantilever; $125M Series D, ~$1.25B, Jun 2025; US Navy/GSA $71M IDIQ) — the clearest
  full-stack play, explicitly trying to own the asset-data/decision layer. **But** bound to Gecko's own
  hardware and services → the opposite of neutral. It is the "hardware verticalizes up" threat made concrete.
- **Data-trust startups** (TrustNXT, Siemens embedded-trust) — building the provenance *primitive*, not the
  end-to-end verify → classify → route workflow.

**Two tailwinds make the robotics framing more than opportunism:**

- **Physical-AI capital wave.** H1 2026 physical-AI funding ~$47.4B across 521 deals, ~4× H2 2025
  (Crunchbase) [MED]. Concentrated in AVs/humanoids — inspection is a smaller, *more mature* slice, which
  **favors a software/verification layer over yet another hardware entrant.** Ground robots are genuinely
  the capture tool now: Boston Dynamics Spot in live substation duty (Consumers Energy, National Grid,
  Avangrid "Sparky"); ANYmal across oil & gas / mining / power (bp, Equinor, ENI). [MED]
- **Regulatory pull toward our audit trail.** The **EU AI Act's deployer traceability obligations went live
  Aug 2, 2026**, putting the audit/record-keeping burden on asset *operators*, not just model vendors
  (high-risk obligations phase in 2027–2028). [MED] This turns CR-12's immutable audit trail from a defensive
  hedge into a **sellable requirement.** "Data trust / provenance for autonomous systems" is becoming a
  named category with no dominant player — whitespace that maps onto our existing provenance work.

**The window is finite.** Hardware vendors are verticalizing up (Orbit, Cantilever, AIM); CMMS vendors are
extending down (IBM Maximo Visual Inspection; OxMaint publishing drone→work-order connectors for
DJI/Skydio/Parrot/DroneDeploy). The land-grab for the neutral middle is happening **now (2025–2026)**. This
argues for pulling the neutral-layer *positioning* forward even while the *build* stays beachhead-focused.

---

## 4. Why the expansion is additive, not a rewrite (the code already agrees)

The current schema separates cleanly into a **modality-neutral value engine** and an **isolable
drone-logistics cluster**:

**Already capture-agnostic (the spine — touch nothing):**
- The ingestion section is literally headed *"HARDWARE-AGNOSTIC INGESTION."*
- `CaptureModality` already enumerates non-drone sources: `HANDHELD_360_VIDEO`, `CRANE_LASER_SCAN`,
  `STATIONARY_IOT_SENSOR` alongside the drone modes.
- `IngestionSession.pilotOrNodeId` is explicitly *"Pilot.id **or IoT unit UUID**."*
- `RadiometricPort` is a format-sniffing **decoder registry** ("ingest from any manufacturer") — the
  capture-side twin of the delivery-adapter registry.
- `Asset`, `Anomaly`, `RuleSet`, `WorkOrderDispatch`, `Integration`, `CaptureQualityEvent` carry **zero
  drone assumptions.** The whole verify→route→audit path is modality-blind.

**UAV-specific, and isolable (the cluster to generalize):**
- `Pilot` (Part 107 license, pilot tier, Stripe payout) · `PilotHardware` (aircraftModel, NDAA/Blue-UAS
  airframe registry, Remote-ID serial) · `PilotInsurance` (dedicated *aviation* policy) ·
  `MissionAssignment` (aviation-coverage dispatch gate).

The correction: generalize this cluster to a **capture-source + compliance-profile** abstraction —
`Pilot` → `Operator/CaptureAgent` (a human pilot *or* an autonomous system), `PilotHardware` →
`CapturePlatform`, and aviation insurance → a **pluggable compliance profile** of which *aviation
insurance + NDAA airframe* is **one** instance. A ground robot or a fixed sensor carries a *different*
(often lighter, sometimes null) compliance envelope. This is exactly the additive, registry-behind-a-seam
pattern the codebase already uses twice (`RadiometricPort`, delivery adapters).

**Honest consequence:** as capture autonomates (drone-in-a-box, Spot, ANYmal), there is **no Part 107 pilot
and no aviation policy to verify.** The pilot-marketplace + aviation-insurance investment (CR-01–CR-10) is
real and well-built, but its **centrality declines** in the robotics future. That is not a sunk-cost
tragedy — it remains the correct machinery for the human-piloted-drone beachhead — but we should stop
treating it as a platform pillar and let CR-14's "demand-driven" discipline keep it from growing
speculatively.

---

## 5. The market, graded honestly

**Beachhead demand is real but the US tailwind softened.**
- Global solar O&M base **348 GW end-2025** (+61 GW in 2025), consolidating — top 15 providers manage ~57%
  (Wood Mackenzie). [HIGH] Consolidation *helps* a concierge land-and-expand motion: fewer, larger buyers.
- **But** IEA cut its 2025–2030 forecast and revised **US solar down ~140 GW** through 2030; US 2025
  installs **−14% YoY** (SEIA: 43.2 GWdc; 279 GWdc cumulative). [MED] The US-only solar story is a weaker
  horse than it was when the beachhead was chosen.
- Clean "drone-inspection-software, 2025–2030" dollar TAM: **no defensible single figure exists** —
  publishers scope it inconsistently (software-only vs. hardware+payload+services) and disagree. [LOW]
  Cite ranges, never a headline number.

**The competitors mostly stop at analytics.** Raptor Maps ($35M Series C, Dec 2024), Sitemark, Zeitview
(acquired Heliolytics), DroneDeploy ($50M + $15M Series E, 2025; break-even Sep 2025), SkyVisor. Several
*claim* work-order generation; **none showed independently-verified closed-loop auto-dispatch into a
third-party CMMS/EAM with a QA gate.** [MED] That is our gap to own — but see §6.

**NDAA / DJI is a real, segment-specific wedge — not a universal gate.** FCC added DJI + Autel to the
Covered List **Dec 22, 2025**; this blocks *new* equipment authorizations but does **not** ground
already-owned units; DJI's reconsideration petition (Jan 2026) is unresolved. [HIGH] NDAA-native dual-sensor
alternatives exist (Skydio X-series, Parrot ANAFI USA, Freefly) but at **320-class thermal — a data-quality
downgrade** for solar thermography. [MED] Federal direction is favorable (Hegseth "Drone Dominance" memo
Jul 2025; FY26 DoD autonomy request ~$13.4B; "Buy American"). [HIGH] The MANIFEST's fail-closed NDAA posture
is *validated* by the finding that "NDAA compliant" is an unverifiable self-claim, not a certification. [HIGH]

**The destination plumbing is sound.** Maximo (OSLC/REST), SAP (OData/BAPI), Hexagon (REST/SOAP),
ServiceNow (REST), MaintainX/UpKeep/Fiix (REST) all expose inbound work-order-creation APIs; the
field-WO destination is **FSM/EAM, not corporate ITSM.** [HIGH] CMMS software ~$1.4B (2024) growing
~9–12%; EAM broader. [MED]

**Expansion asset classes where *robots* (not just drones) are the capture tool, ranked:** substations /
transmission thermal (Spot already deployed; NERC FAC-003 mandates annual/≤18-mo inspection — a genuine
regulatory tailwind [HIGH]); oil & gas / refinery (highest-value; ANYmal + crawlers; OGI methane);
wind-turbine blades (RGB; crawling robots); bridges/concrete (FHWA NBIS 2022 update incorporates UAS
[HIGH]); building envelope (thinnest data). All share the reality-reconciliation core.

---

## 6. The four load-bearing assumptions to validate *before* heavy build

These are asserted in the current GTM draft as if settled. The scan could **not** substantiate them. They
are not necessarily wrong — they are *untested*, and each is load-bearing. Treat these as the customer-
discovery agenda, not facts to design against.

1. **"Standards-classified documentation is a *buying requirement*."** [LOW] IEC TS 62446-3 is still a
   2017 *Technical Specification* — current, but **not shown to be mandatory anywhere**, and **no insurer or
   lender requirement tied to it** surfaced. *Validate:* ask 5–10 O&M buyers / lenders' technical advisors
   whether standards-classed evidence changes a procurement or a warranty outcome.
2. **"The fault→work-order last-mile gap is big and quantified."** [LOW] Qualitatively supported (fragmented
   point-solutions; no standard ServiceNow/MaintainX solar integration) but **no independent/analyst
   quantification** — the only "40% of defects sit unaddressed" figure is a CMMS vendor's marketing.
   *Validate:* get one real operator's leakage rate and the cost attached to it.
3. **"Buyers will pay a premium for *verified/defensible* output over raw analytics."** [LOW] **No public
   datapoint.** The whole pricing thesis (unit of value = the verified work order) rests on this.
   *Validate:* this is the single most important thing to test in discovery; it decides the pricing model.
4. **"Federal procurement prefers auditable / chain-of-custody evidence."** [LOW] Plausible (inferable from
   Buy-American + domestic-preference audit regimes) but **no FAR/DFARS/NDAA provision mandating
   evidentiary chain-of-custody for inspection data** was found. *Validate:* a conversation with one
   federal/DoD inspection buyer or a GovCon advisor.

A counter-tailwind to hold honestly: a NERC VP (Mar 2026) noted utilities are **reluctant to fly drones**
over assets due to FAA restrictions — which *strengthens* the ground-robot expansion case (no FAA airspace
friction for a Spot walking a substation). [MED]

---

## 7. The corrected plan

**Positioning / category (do now — it's words, not code).**
- Lead with: *"the verification & provenance layer for autonomous inspection."* Sensor- and robot-agnostic.
  Solar-thermal-via-drone is the **proof point**, not the pitch.
- Promote **provenance/audit to a headline capability** (EU AI Act deployer-traceability hook), not an
  internal implementation detail. This is where the durable moat and the regulatory wind align.
- Keep "evidence, not verdict" (CR-12) — now reframed as a *compliance feature*, not only a liability hedge.

**ICP re-weighting.**
- Keep the compliance-sensitive solar/federal land motion already in `GTM-STRATEGY.md`.
- **Add ground-robot-captured enterprise verticals** — substations/transmission (thermal; NERC-mandated),
  oil & gas (highest ACV; ANYmal deployed), mining — where autonomy removes the pilot/insurance friction
  *and* the destination is enterprise CMMS/EAM (Maximo/SAP/Hexagon → higher ACV than mid-market).

**Architecture (propose as CRs — do not execute unilaterally; see §8).**
- Generalize `Pilot`/`PilotHardware` → `CaptureAgent`/`CapturePlatform`; aviation-insurance + NDAA → one
  **pluggable compliance-profile** behind a seam, with a null/light profile for autonomous/fixed capture.
- Add an **autonomous ingestion path** (scheduled/triggered capture from a robot or dock, no human mission
  assignment) alongside the pilot-mission path.
- Freeze deepening of the pilot-marketplace + aviation-insurance rails beyond the beachhead's needs
  (CR-14 demand-driven already licenses this restraint).

**Pricing.**
- Anchor on the defensible output: **per-verified-work-order** or **per-verified-MW / per-asset** (capacity-
  based, matching Gecko/Raptor norms). Per-work-order pricing is **not** a visible norm in the space —
  whitespace to define the category on our terms. **Explicitly avoid per-acre imagery pricing.** Gate this
  on assumption #3.

**Partnerships.**
- **Ingest from** fleet orchestrators (Energy Robotics, Percepto) and acquisition networks (Zeitview) rather
  than compete on capture.
- **Co-market** with NDAA-native OEMs (Skydio, Parrot) into federal/utility.
- Position as the neutral layer that CMMS/EAM vendors route *from*.

---

## 8. Recommended next steps

1. **Decide the direction in this memo** (stay-plus-correct, or stay-as-is). Everything below is gated on it.
2. If accepted: **promote `GTM-STRATEGY.md` to v1.0** with the §7 corrections (I can draft it).
3. **Draft the capture-source generalization as a new CR** (`CaptureAgent`/`CapturePlatform` +
   compliance-profile seam + autonomous ingestion path), with the MANIFEST amendment in the same commit per
   CLAUDE.md. **Proposed, reviewed, then executed — not written into canon from this memo.**
4. **Run the §6 customer-discovery agenda** against 5–10 buyers before committing build to assumptions
   #1–#4 — especially the WTP-for-verified test (#3), which decides the pricing model.
5. **Do not re-baseline M2.** Finish the solar-thermal beachhead as the first proof; the generalization is
   additive and can sequence behind the first reference account, consistent with M2's "harden the credibility
   chain" posture.

---

## 9. Watch-items & optionality (monitor; do not build now)

### 9.1 DePIN / machine economy (peaq et al.)

DePIN intersects our **category** (identity + provenance for autonomous systems) but collides with our
**buyer**. Four of our primitives are centralized analogs of DePIN primitives — airframe/machine identity
(CR-11) ↔ machine DIDs; immutable audit trail (CR-12) ↔ cryptographic provenance; pilot marketplace/payout
(CR-08) ↔ machine micropayments; acquisition-network capture supply ↔ token-bootstrapped hardware supply.
**peaq** (DePIN Layer-1; mainnet Nov 2024; ~$70–200M cap, on-chain TVL ~$1M mid-2026 — strong narrative,
early actual adoption) positions as the identity/access/payment layer for machines, with robotics analyst
backing (HashKey, Feb 2026) and enterprise ties (Mastercard, Bosch, a Dubai VARA "Machine Economy Free
Zone"). [MED]

**Stays out of core for three reasons:** (1) **buyer allergy** — regulated utility/federal/enterprise
buyers treat token/crypto exposure as *risk* against the fail-closed, defensible posture that is the moat;
(2) **trust-model tension** — DePIN is *trustless* by design, but our product's value is being the
*trusted, accountable* third party, so we must not disintermediate ourselves; (3) **the market isn't
connecting it** — inspection robotics and DePIN remain separate universes (no DePIN↔industrial-inspection-
provenance linkage surfaced, Oct 2026). [MED]

**Competitive vector to watch:** if a DePIN-native provenance standard (machine-DIDs + a data-trust
protocol) became the default attestation for robot-collected data, that is a long-range attack on our
provenance moat from the decentralized side — same EU-AI-Act demand, opposite architecture. Low-probability
on our near-term buyer; keep a file on it.

**Optionality we keep open (demand-gated, CR-14):** (a) **machine-identity interop** — if machine DIDs win
as a standard, *anchor* CR-11 verification to them rather than fight; (b) **Ring-3 distributed capture** —
token-incentivized supply is a proven bootstrapping mechanism *if* we ever build a global multi-operator
capture network; (c) the audit-ledger architecture below.

### 9.2 The audit ledger — tamper-evidence without a blockchain (now CR-41)

Immutability is the point, but it is a **data-structure + anchoring problem, not a consensus problem.** The
real question is *who the adversary is*: defending against accidental mutation or a rogue employee needs
only an append-only signed log; defending against "DatumZero itself altered/back-dated the record" — which
is what a hostile OEM or a regulator actually tests — needs an external witness we do not control.
Recommendation: adopt blockchain-*derived* techniques **without a chain or a token**, in three layers:

1. **Append-only, hash-chained audit log in Postgres** — each record carries the hash of the prior record;
   append-only enforced at the DB for the least-privilege `datumzero_app` role. The immutability structure,
   no new infra.
2. **Digital signatures (AWS KMS)** on each determination — non-repudiation ("who decided it, and that it is
   unaltered"), with CloudTrail logging every key use.
3. **Periodic external anchoring** of the log's Merkle root to an independent witness — an **eIDAS-qualified
   / RFC-3161 timestamp** (legally recognized in the EU; the boring, defensible default) and/or a public-
   chain anchor via OpenTimestamps. This is the *only* layer that proves integrity **against DatumZero
   itself**, and it is the concrete form of the "optional cryptographic notarization" feature (an
   evidence-premium / compliance tier).

A full **private/consortium blockchain is rejected for now**: if we run the validators it is immutability
*theater* (we still control it) at large ops / SOC-2-surface / complexity cost, fighting the lean +
RLS-Postgres posture and the buy-don't-build discipline. The trigger that would justify a genuine shared
ledger is a **multi-party consortium** scenario (asset owner + OEM + insurer + us sharing one authoritative
record none of them hosts) — a specific-deal / Ring-3 case, not now. **Marketing note:** say
"cryptographically tamper-evident, independently timestamped audit trail," *not* "blockchain" — the word
raises more risk flags than it soothes in enterprise/gov procurement, even though the techniques are an asset.

---

## Appendix — confidence ledger & sources

Grades reflect the strongest source found, not the number of sources.

- **[HIGH]** FCC DJI/Autel Covered List 22 Dec 2025 & effect; "NDAA compliant" is a self-claim not a cert;
  enterprise CMMS/EAM inbound WO APIs; FSM≠ITSM destination; NERC FAC-003 annual/≤18-mo mandate; FHWA NBIS
  2022 UAS incorporation; Wood Mac 348 GW O&M base; SEIA 279 GWdc US; DoD "Drone Dominance" direction + FY26
  ~$13.4B autonomy request; EU AI Act dates (as published).
- **[MED]** EU AI Act *deployer-traceability-as-demand-driver* interpretation; physical-AI $47.4B H1 2026;
  robotics-inspection deployments (self-reported); competitor funding totals (aggregator-conflicting);
  US −140 GW solar revision; 320-class NDAA thermal downgrade; competitors "stop at analytics"
  (no verified closed loop found, but absence of evidence).
- **[LOW] / validate** the four §6 assumptions; all market-size dollar figures (scope-dependent, 2030
  estimates diverge up to ~2.5×); truck-roll $150–300 & 30–50%-avoidable; warranty-recovery case figures;
  Percepto post-2020 funding; CIP-014 drone-specific guidance.

Primary-source upgrades worth commissioning for a board/investor-grade version: a licensed Wood Mackenzie
2026 solar-O&M report, NREL/LBNL PV-O&M cost benchmarks, and one Gartner/Verdantix EAM source to replace
aggregator citations.

Three-thread scan compiled 2026-10-27. Full source URLs are in the research transcripts for this session.
