# Datum Zero — Go-To-Market Strategy

**Status:** v1.0 — active strategy doc. Supersedes draft v0.1. Sits alongside `MANIFEST.md` as the commercial
counterpart to the technical vision; nothing here amends an architecture contract (those are CRs). The
analysis basis + confidence grades are in [`GTM-PASS-2026-10.md`](./GTM-PASS-2026-10.md); the audit-ledger
moat is now canon ([CR-41](./PRD-Corrections-Log.md)); the capture-source generalization is canon (CR-42, implementation demand-gated)
([`proposals/CR-42-capture-source-generalization.md`](./proposals/CR-42-capture-source-generalization.md)).

> **What changed v0.1 → v1.0:** the identity moves from *drone solar-inspection tool* to *sensor- and
> robot-agnostic verification & provenance layer*; the opportunity is framed as three concentric rings;
> provenance/audit is promoted to a headline capability (EU AI Act tailwind); the ICP adds ground-robot
> verticals; pricing anchors on the verified work order; and four load-bearing assumptions are made explicit
> validation gates instead of settled facts.

---

## 0. One-line framing

**Datum Zero is the neutral verification, routing, and provenance layer that turns reality-capture — from
any drone, any ground robot, any fixed sensor — into human-verified, standards-classified, evidence-framed,
fully provenanced work orders delivered into the systems a client already runs.** We are not an analytics
dashboard, not a CMMS, not a pilot network, and not a robotics company. We are the trustworthy *last mile*
between capture and action — and the system of record for *why the finding can be trusted*.

---

## 1. Category & positioning

**What we are:** the verification & provenance layer for autonomous physical-asset inspection. Capture in →
measured, standards-classified, human-adjudicated, evidence-framed, provenanced work order out → routed into
the client's existing CMMS/EAM (Maximo, SAP, Hexagon, ServiceNow, MaintainX, or a generic webhook).

**What we are deliberately *not*:**
- **Not an inspection-analytics platform** (Raptor Maps, Sitemark, SkyVisor). Crowded, entrenched, competes
  on imagery/dashboards — not our moat.
- **Not a CMMS/EAM** (Maximo, SAP, ServiceNow). We feed those; we don't replace them.
- **Not a capture company** — not a drone/pilot network (Zeitview) and not a robot maker (Boston Dynamics,
  ANYbotics, Gecko). We *ingest from* them.

**Positioning statement:** *"For asset owners and O&M operators under compliance, warranty, and audit
pressure, Datum Zero is the neutral layer that converts any robotic or aerial capture into defensible,
standards-classified, provenanced work orders inside your own systems — verified by a human, dispute- and
audit-ready, with no new dashboard to babysit."*

The through-line: **our product is not the picture, it's the trustworthy decision, its clean handoff, and
the proof it can withstand a dispute.**

---

## 2. The opportunity — three concentric rings

One job-to-be-done — *"turn my reality-capture into a trusted, actioned, defensible decision in my system of
record"* — expanding outward in capture-source and asset-class scope.

- **Ring 1 — The wedge (0–12 mo): the verified last mile for solar-thermal O&M.** One buyer type
  (utility-scale solar O&M / IPP under dispute or compliance pressure), one capture mode (drone thermal),
  nearly built. Purpose: land the first reference logo and convert the §12 assumptions into facts. Price
  per-verified-MW.
- **Ring 2 — The platform (12–30 mo): reality reconciliation across capture sources and asset classes.**
  Same engine, new ingestion (ground robots at substations / oil & gas / mining — where autonomy removes
  the pilot + aviation-insurance friction entirely) and new classes (transmission thermal, O&G, wind). ACV
  rises because the destination is enterprise (Maximo/SAP/Hexagon).
- **Ring 3 — The category / the prize: the neutral verification & provenance layer for autonomous
  inspection.** The EU-AI-Act-driven trust layer every robot fleet and every CMMS routes *through* — a
  neutral utility with accumulating data network effects.

---

## 3. Why now (market timing)

1. **The compliance / hardware transition (DJI ruling).** The FCC added DJI + Autel to the Covered List
   (Dec 22 2025); new equipment authorizations are blocked (existing units still fly; DJI's reconsideration
   petition unresolved). This forces an NDAA/Blue-UAS migration across the market and advantages anyone
   NDAA-compliant by design (CR-11) — *segment-specific* (federal/utility), not a universal gate, and
   tempered by a 320-class thermal downgrade on NDAA-native airframes.
2. **The routing "last mile" is an open, under-served gap.** Incumbents stop at analytics; the verified,
   structured handoff into the CMMS/EAM is fragmented point-solutions. *(Qualitatively supported; not yet
   independently quantified — see §12.)*
3. **The physical-AI wave.** 2025–2026 saw a step-change in robotics/physical-AI capital (~$47.4B H1 2026,
   ~4× H2 2025). Ground robots are now the capture tool for substations, O&G, and mining (Spot, ANYmal in
   live deployment). Inspection is a smaller, more mature slice — which favors a verification *layer* over
   yet another hardware entrant.
4. **Regulatory pull toward provenance.** The EU AI Act's deployer-traceability obligations went live
   Aug 2 2026, putting the audit/record-keeping burden on asset *operators*, not just model vendors. This
   turns our immutable audit trail (CR-12/CR-41) from a defensive hedge into a *demand driver*.

---

## 4. The moat — ranked, and where to invest

The MANIFEST names "adjudication + audit + routing + registry." Ranked by durability against the real
threats (hardware vendors verticalizing up; CMMS extending down; a funded neutral entering):

1. **The longitudinal reality ledger (compounding — invest most).** Registry + recurring inspections +
   drift detection (CR-13): over time we hold each asset's history — baselines, prior findings, drift,
   provenance. A competitor starting fresh has no time-in-account and cannot shortcut it. Make recurring
   inspection + longitudinal drift the core retention mechanism.
2. **Trust/compliance as architecture (strengthens with regulation).** The immutable, tamper-evident,
   KMS-signed, externally-anchorable audit trail (CR-12/CR-41) becomes load-bearing the moment a client's
   *compliance posture* depends on it (EU AI Act, SOC 2, gov procurement). Can't be bolted on — it's
   architectural from day one. Surface it through the evidence vault (§7).
3. **Neutrality as position (winner-take-most — claim it now).** Hardware vendors can't be neutral (they
   compete); CMMS vendors won't do multi-vendor capture ingestion. Incumbents are structurally disqualified
   — but a new neutral (Energy Robotics) is not, so the land-grab is live in 2025–2026.
4. **Switching cost via embeddedness.** Low friction to adopt (route into *their* system); high friction to
   remove once the registry, their RuleSet policies, their field mappings, and their audit history accrue.

Explicitly **not** a moat: the CV detector, the radiometric decode, the pilot rails (Commandment 10 — buy/
fine-tune; table stakes or someone else's game). The thin-layer failure mode — being absorbed as a feature
by a CMMS or an orchestrator — is defended only by depth (#1, #2) + breadth (#3, #4).

---

## 5. ICP & segment prioritization

**Beachhead (Ring 1):** utility-scale **solar-thermal O&M** — most tractable CV, crisp standard
(IEC TS 62446-3), standardized taxonomy. Consolidating to fewer, larger buyers (helps a concierge
land-and-expand motion). *Headwind: US solar installs were revised down (~140 GW through 2030); global O&M
base still growing (348 GW end-2025).*

| Priority | Segment | Why it's a wedge | Capture |
|---|---|---|---|
| **1** | Federal / DoD / government solar & energy | Hard NDAA requirement excludes DJI-based incumbents; procurement values defensible evidence. | Drone (NDAA-native) |
| **1** | Regulated utility-scale operators / IPPs | Dispute/warranty exposure; Maximo/ServiceNow to route into; value the last-mile handoff. | Drone |
| **2** | **Substations / transmission** | Thermal core; **NERC FAC-003 mandates annual/≤18-mo inspection**; no FAA airspace friction for a walking robot. | **Ground robot** (Spot/ANYmal) + drone (lines) |
| **2** | **Oil & gas / refinery** | Highest ACV; ANYmal + crawlers deployed; OGI methane; enterprise CMMS destination. | **Ground robot** + drone |
| **2** | Insurance / warranty claims | Physical-damage adjudication needs defensible evidence; distinct buyer + budget. | Drone (RGB+thermal) |
| **3** | Commercial / merchant O&M (broad market) | Largest but most contested (Raptor/Sitemark). Enter later or via partnership. | Drone |

**Expansion vector:** the two sensors travel to different verticals — **thermal** → substations,
transmission, industrial heat, building envelope; **RGB** → structural/physical condition (concrete,
bridges, façades, wind blades, corrosion). "Reality reconciliation" generalizes beyond solar once the
beachhead motion is proven.

---

## 6. Competitive map & where we sit

- **Analytics/inspection platforms** — Raptor Maps ($35M Series C, Dec 2024), Sitemark, Zeitview (acquired
  Heliolytics), DroneDeploy (Series E 2025, break-even), SkyVisor. Win on imagery/analytics; **none showed
  independently-verified closed-loop auto-dispatch into a third-party CMMS/EAM with a QA gate.**
- **Fleet orchestrators (the one moving toward us)** — **Energy Robotics** (hardware-agnostic, multi-OEM,
  Shell/BP/BASF) stops at capture + mission control + analytics; no verified routing/audit. **Watch closely.**
- **Hardware verticalizing up** — Boston Dynamics (Orbit), ANYbotics, Percepto (AIM, also orchestrates
  Spot), **Gecko Robotics** (Cantilever, full-stack, US Navy IDIQ). Each wants the data/decision layer but
  is bound to its own hardware → structurally non-neutral.
- **CMMS extending down** — IBM Maximo Visual Inspection; OxMaint-style drone→work-order connectors. Own the
  destination; can pull ingestion toward themselves.
- **Vendor-locked routing** — Siemens Aerosophia *does* route findings into CMMS/EAM/SAP, but Siemens-locked.
- **Provenance/data-trust startups** — TrustNXT, Siemens embedded-trust: building the primitive, not the
  end-to-end workflow.

**Our position:** no single player owns *neutral-across-both-hardware-and-CMMS + human-QA + standards-
classification + evidence-framed routing + provenance/audit*. That precise wedge is unclaimed. Do not
position as "another inspection platform."

---

## 7. Product posture — headless spine, evidence vault, API (resolves the UI question)

Three surfaces, split by purpose:

1. **Internal cockpit (built):** the QA reviewer's workbench + config + admin (Tactical HUD, CR-40). Not
   customer-facing-operational.
2. **Headless output (the spine):** the verified work order into the client's CMMS/EAM. Primary delivery.
   This is the product's humility and its wedge — no new dashboard to babysit (Commandment 1 / CR-06).
3. **The evidence vault (build as the moat matures, demand-gated):** a read-mostly surface the client opens
   *on demand* to defend a finding, run an EU-AI-Act audit, or support a warranty claim — the crop, ΔT,
   standard reference, reviewer stamp, capture provenance, and the CR-41 chain-of-custody. This is a
   *system of record for trust*, not an operational dashboard — the distinction that keeps it inside CR-06.

**Never build the operational analytics dashboard** (the crowded losing lane). **The API is the most
important interface for Rings 2–3** — robots and fleet platforms integrate programmatically; this is the
productized verification API, kept non-cannibalizing.

---

## 8. GTM motion — land & expand

**Land (wedge):** a single high-stakes, compliance-sensitive account (federal/utility) — one site,
thermal-mandatory capture, verified work orders routed into their existing CMMS. Prove: fewer false
dispatches, faster fault→work-order cycle, a defensible evidence trail, zero new dashboard.

**Expand:** (1) more sites/fleet within the account (usage-led); (2) add RGB (dual-sensor) for physical-
defect + insurance/warranty use cases; (3) more destinations (native adapters); (4) **new capture sources —
ground robots at substations/O&G** (Ring 2), where autonomy removes the pilot/insurance friction;
(5) adjacent asset classes off the shared reality-reconciliation core (Ring 3).

**Architecture that serves the motion:** thermal-mandatory, RGB-optional, capability-declared, graceful-
degradation — and (CR-42, proposed) capture-source-agnostic, so we onboard existing DJI fleets, NDAA-native
Skydio/Parrot fleets, *and* autonomous robots behind one ingestion seam.

---

## 9. Packaging & pricing (directional)

- **Unit of value = the verified, routed work order.** Price **per-verified-work-order** or
  **per-verified-MW / per-asset** (capacity-based, matching Gecko/Raptor norms). Per-work-order pricing is
  *not* a visible norm in the space — whitespace to define the category on our terms. **Avoid per-acre
  imagery pricing.** *(Gated on the §12 WTP test.)*
- **Evidence premium:** dual-sensor / higher-assurance verification as a higher tier.
- **Compliance tier:** NDAA/Blue-UAS deployments + the CR-41 externally-anchored, legally-timestamped audit
  trail (the EU-AI-Act defensibility package) as a priced tier.

---

## 10. Channel & partnerships

- **Direct** to regulated enterprise/federal (evidence + compliance land motion).
- **Ingest from** fleet orchestrators (Energy Robotics, Percepto) and acquisition networks (Zeitview) —
  capture supply, not competition.
- **Co-market** with NDAA-native OEMs (Skydio, Parrot) into the buyer base displaced by the DJI ruling.
- **CMMS/EAM ecosystems** (Maximo, SAP, ServiceNow, MaintainX) — presence where work orders land; be the
  neutral layer they route *from*.

---

## 11. Messaging against alternatives

- *vs analytics platforms:* "They tell you what's wrong. We make it a defensible, standards-classified work
  order in your own system — verified by a human, dispute- and audit-ready, no new dashboard."
- *vs raw CMMS/webhooks:* "Monitoring alerts get read and lost. We turn capture into a tracked, evidence-
  framed work order — automatically, into the CMMS you already run."
- *vs hardware vendors' own software:* "They can't be neutral — they compete with every other robot and
  drone you fly. We verify and route whatever you capture, from anyone."
- *vs DJI-dependent incumbents:* "NDAA-compliant by design — the December 2025 ruling is a migration for
  them and a non-event for you."
- *on provenance:* "Cryptographically tamper-evident, independently timestamped — defensible against an OEM
  or a regulator, not just stored." (Never say "blockchain.")

---

## 12. Working assumptions (build on these; validate opportunistically — not a build gate)

These are load-bearing and, externally, **asserted more than evidenced** (see GTM-PASS §6) — but none, if
wrong, forces a teardown; each lands on a deferred/reversible layer or a low-regret feature (see
[`DISCOVERY-AGENDA.md`](./DISCOVERY-AGENDA.md) §0). So we **build on them as working assumptions now** and
validate *opportunistically* via the first concierge/lighthouse account, not a blocking interview sprint.
The one to hold loosest is #3 — it sets pricing, so keep billing/metering unbuilt until a real deal prices
it:

1. **Standards-classified documentation is a buying requirement.** IEC TS 62446-3 is a 2017 TS, not shown
   mandatory anywhere; no insurer/lender tie found. *Test with O&M buyers / lenders' technical advisors.*
2. **The fault→work-order last-mile gap is big and quantified.** No independent quantification exists.
   *Get one operator's real leakage rate + cost.*
3. **Buyers pay a premium for verified/defensible output over raw analytics.** No public datapoint — and it
   underpins the entire pricing thesis. *The single most important discovery test; it decides §9.*
4. **Federal procurement prefers auditable/chain-of-custody evidence.** Plausible, not found in FAR/DFARS/
   NDAA text. *Test with a federal/DoD inspection buyer or GovCon advisor.*

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| The four §12 assumptions prove weak | Validate in discovery before committing build; pricing + positioning are hypothesis-gated. |
| NDAA-native dual-sensor fleet smaller/pricier + 320-class thermal | Thermal-mandatory/RGB-optional serves DJI fleets too; NDAA is a *segment* wedge, not a universal gate. |
| US solar install slowdown | Global O&M base still growing + consolidating; balance with federal, insurance/warranty, and Ring-2 robot verticals. |
| Scope creep toward "inspection platform" | Guardrail: evidence + routing + provenance only; never an independently-graded analytics product; stay headless (evidence vault ≠ operational dashboard). |
| Incumbent / orchestrator adds verification + routing | Depth (reality ledger, audit architecture) + breadth (neutrality) are hard to bolt on; claim the neutral position now — the land-grab is live. |
| Hardware vendors verticalize up / CMMS extend down | Be the Switzerland they structurally can't be; embed via registry + policies to raise switching cost. |
| DePIN-native provenance becomes the default attestation | Long-range vector on the provenance moat (GTM-PASS §9.1); keep machine-identity interop optionality open (CR-42 seam); monitor. |
| Pilot/insurance investment (CR-01–CR-10) declines in relevance as capture autonomates | Reframe it as a beachhead/human-pilot module, not a platform pillar; don't deepen speculatively (CR-14). |

---

## 14. Proof points / metrics to validate the GTM

- **Verification quality:** false-dispatch rate; reviewer confidence; dispute/chargeback rate on routed WOs.
- **Last-mile:** capture→verified-work-order cycle time; % of findings that become tracked work orders.
- **Trust:** audit-trail pulls in a real dispute/audit; compliance-tier attach rate (EU AI Act / gov).
- **Land/expand:** logo → second site → RGB attach → new capture source (robot) → additional destinations;
  net revenue retention.
- **Compliance wedge:** % of pipeline gated on NDAA where we are the only qualified option.

---

## 15. Roadmap alignment

- **Now:** finish the solar-thermal beachhead (Ring 1) as the first proof — do not re-baseline M2.
- **Canon:** CR-41 (tamper-evident audit ledger) merged → the trust moat is specified; build is the M2-8
  platform-hardening track.
- **Canon (demand-gated):** CR-42 (capture-source generalization) — the additive seam that makes Ring 2
  possible without a core rewrite; the decision is locked, the build lands with/just before the first Ring-2
  deal (CR-14).
- **Later:** the evidence vault (§7); the productized verification API; vertical/asset-class + capture-source
  expansion off the shared reality-reconciliation core.

---

## Appendix — research & analysis basis

Full market/competitive scan, confidence grades, and source URLs:
[`GTM-PASS-2026-10.md`](./GTM-PASS-2026-10.md) (compiled 2026-10-27). Key confidence caveats carried into
this doc: market-size dollar figures are scope-dependent and diverge widely; competitor "stops at analytics"
is supported by absence of verified closed-loop evidence; the §12 assumptions are explicitly unproven.
Primary-source upgrades worth commissioning for an investor-grade version: a licensed Wood Mackenzie 2026
solar-O&M report, NREL/LBNL PV-O&M cost benchmarks, and one Gartner/Verdantix EAM source.
