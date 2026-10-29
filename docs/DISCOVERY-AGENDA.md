# Datum Zero — Customer Discovery Agenda

**Status:** **non-blocking / opportunistic — NOT a build gate** (revised 2026-10-29). **Purpose:** record the
working assumptions we build on, and keep a lightweight toolkit for validating them *opportunistically* —
primarily through the first concierge/lighthouse account (M1 was designed for exactly this), not a blocking
interview sprint. Pairs with [`GTM-STRATEGY.md`](./GTM-STRATEGY.md) §12 and
[`GTM-PASS-2026-10.md`](./GTM-PASS-2026-10.md) §6. This is validation, not selling.

> **Why non-blocking:** none of the four assumptions, if wrong, forces a teardown — each lands on a deferred
> or reversible layer (pricing/metering, messaging) or a low-regret feature, never the spine. The
> pivot-friendly architecture absorbs the risk, so we build on priors now and let the first real customer
> validate better (and cheaper) than any interview could. §0 is what we're building on; §§1–9 are the
> opportunistic toolkit, retained for when a real conversation presents itself.

---

## 0. Working assumptions (what we build on now)

We adopt these as priors and build against them. For each: the layer it affects, why being wrong is cheap to
correct, and the free signal — from the first lighthouse account — that would make us revisit. **No build
waits on validating these.**

| # | Working assumption (the prior we build on) | Layer it affects · reversibility | Revisit trigger (free signal) |
|---|---|---|---|
| **A1** | Standards-anchored classification (IEC TS 62446-3) is a credibility/quality asset and a requirement for a meaningful share of regulated / lender-backed projects. | Standards/RuleSet layer · **low-regret** (good product regardless; worst case we stop deepening conformance). | First lighthouse contract / IE scope either names a standard or doesn't. |
| **A2** | Automated fault→work-order routing into the client's CMMS is under-served and valued. | Routing/outbox · **already built, generic; reversible messaging.** | Does the first customer's current process actually lose findings? Watch their handoff. |
| **A3** *(hold loosest)* | The verified, routed work order is the unit of value and commands a premium over raw analytics. | Pricing/metering · **deferred (M1.5) + highly reversible** (meters on `WorkOrderDispatch`; unit swap is a query). | What the first customer actually pays, and what survives their procurement. **Discipline: do not build billing/metering until a real deal prices itself.** |
| **A4** | Auditable / chain-of-custody evidence is preferred (beyond NDAA) in federal/regulated buying; the EU AI Act makes provenance a demand driver for EU/enterprise regardless. | CR-41 ledger (built for EU-AI-Act reasons anyway) + messaging · **messaging-only reversibility.** | First federal RFP / enterprise contract language. |

**The standing discipline that keeps pivots cheap:** don't over-build the assumption-dependent surfaces
(billing/metering, any paid provenance tier) ahead of real signal, and honor the CR-42 compliance-profile
seam when touching the pilot cluster. Do that and every revisit above stays a config/messaging change, not a
rebuild.

---

## 1. What we're de-risking (falsifiable hypotheses)

Each is stated so it can be killed. "If false" is the decision it forces.

| # | Hypothesis (stated to be falsified) | Why load-bearing | If false → |
|---|---|---|---|
| **A1** | Standards-classified documentation (IEC TS 62446-3 or equivalent) is a **named buying/contract/warranty requirement**, not just a nicety. | Underpins the "standards rigor" wedge + the compliance-tier pricing. | Standards become a *credibility signal*, not a wedge; drop "standards-classified as a requirement" from positioning. |
| **A2** | Inspection findings **routinely fail to become tracked work orders today**, at a cost buyers can name. | Underpins the "routed last mile" value prop. | De-emphasize routing; differentiate on verification + provenance instead. |
| **A3 — CRUX** | Buyers will **pay a premium for verified/defensible output** over raw analytics, and a "verified work order" line item **survives procurement**. | Underpins the entire pricing thesis (unit of value = the verified work order). | Abandon per-verified-WO pricing as the headline; revert to capacity-based (per-MW); verification becomes a feature, not the priced unit. |
| **A4** | Federal/DoD procurement **prefers or requires auditable / chain-of-custody evidence** for inspection data. | Underpins the federal provenance angle (distinct from NDAA). | Keep NDAA as the federal wedge; drop "auditable-evidence preference" from federal messaging (EU AI Act still supports the provenance tier for EU/enterprise). |

**Portfolio rule:** **A3 is must-pass.** If A3 comes back red, stop and course-correct pricing before
spending on anything else — it changes the business model, not just the pitch. A1/A2/A4 shape positioning
and are individually survivable; two or more red is a signal the whole "defensible last mile" framing is
weaker than the memo assumed.

---

## 2. Principles (how to get truth, not politeness)

The failure mode of founder discovery is confirmation bias — a warm "yeah, that's interesting" is **not**
validation. Rules:

1. **Ask about the past, not the future.** "Walk me through the last time X happened" beats "would you
   buy Y?" People lie about the future and tell the truth about last Tuesday.
2. **Chase money and artifacts.** A scar with a dollar figure, or a contract/RFP clause they can show,
   outweighs ten opinions. "Can you show me where that's written?" is the strongest question we have.
3. **Don't pitch.** If they ask what we're building, deflect to the end. The moment you pitch, discovery
   becomes a demo and the data goes bad.
4. **Count scars, not nods.** A validated signal is a *specific, unprompted, money- or artifact-backed*
   instance of the pain. Everything else is noise.
5. **Talk to the role that feels the pain and the role that signs.** Often different people.
6. **Write it down within an hour.** Tag against A1–A4 the same day (§7).

---

## 3. Who to talk to (segment × role)

Target **~15–20 conversations** over ~4–6 weeks. Each role is chosen for the assumptions it can actually
answer (and who can show an artifact).

| Role / who | Segment | Answers | Why them |
|---|---|---|---|
| **O&M director / operations manager** | Solar O&M provider, IPP | A2, A3 | Lives the finding→work-order handoff and the truck-roll economics. |
| **Asset manager / owner's engineer** | IPP / asset owner | A2, A3, A1 | Owns uptime + warranty exposure; feels dispute pain. |
| **Independent engineer / technical advisor** | Project-finance lender (DNV, Leidos-style IE firms) | **A1**, A3 | *Sets* technical requirements in financing scopes — the strongest artifact source for "is a standard required." |
| **Warranty / claims manager** | Module OEM, EPC, or asset owner | **A3**, A1 | The dispute scar lives here — lost/won claims on evidence quality. |
| **Procurement / contract manager** | Utility / large IPP | **A3** (pricing survivability) | Tells us whether a "verified" line item survives a procurement process. |
| **GovCon capture lead / federal inspection program buyer** | Federal/DoD, defense-adjacent integrator | **A4** | Can confirm (or deny) chain-of-custody as an RFP/evaluated factor. |
| **Asset manager using/evaluating ground robots** | Substation / O&G / mining | A2, A3 + **Ring-2 resonance** | Tests whether the robot-capture → verified-WO story lands beyond solar (validates the expansion, not just the beachhead). |

Recruit 2–3 in each of the first four rows (phase 1), 2 in each of the last three (phase 2).

---

## 4. Sequencing & timeline

- **Phase 1 (weeks 1–3) — the crux + the reachable.** O&M directors, asset managers, independent engineers,
  warranty managers, one procurement contact. Front-loads **A3** (pricing) and **A2**, and gets **A1** from
  the IEs. Cheapest to reach via SEIA/Amicus networks, lender IE firms, and warm intros. **Checkpoint at
  ~10 interviews:** re-weight before spending phase-2 effort.
- **Phase 2 (weeks 4–6) — federal + robotics.** GovCon/federal buyers (**A4**) and robot-using asset
  managers (Ring-2 resonance). Longer sales-cycle, harder access — only worth it if phase 1 didn't already
  kill A3.

Access is the real constraint (utility/federal O&M buyers are hard to reach). Lead with the **NDAA-displaced-
buyer** opener (a live, dated reason to talk) and warm intros via investors/advisors; treat cold outreach as
the backstop.

---

## 5. Interview guide (~30 min, behavior-based)

**Open (no pitch):** "I'm researching how solar O&M teams turn inspection findings into action — I'm not
selling anything, just trying to understand how it really works. Can I ask about how your team does it
today?"

**Warm-up:** role; walk me through your inspection → maintenance process end to end.

**Core question bank** (ask the ones their role can answer; always past-tense + specifics + money):

- **A1 — standards as requirement:**
  - "When you commission a thermal inspection, is a standard named anywhere — contract, RFP, warranty, IE
    scope? Can you point me to it?"
  - "Has a finding ever been rejected because it wasn't classified to a standard? What happened?"
  - *(IEs)* "In your technical advisory scopes, do you require a specific thermography standard? Which, and
    since when?"
- **A2 — last-mile gap:**
  - "Walk me through the last drone/robot finding that became a work order. How did it get there?"
  - "Of the findings from your last inspection, roughly how many became tracked work orders? What happened
    to the rest?"
  - "Has a real problem ever slipped because a finding never made it into the CMMS? Tell me about it."
- **A3 — WTP for verified (spend the most time here):**
  - "Tell me about the last time an inspection finding was disputed or a truck roll turned out to be a false
    alarm. What did it cost, and who ate it?"
  - "Have you ever lost (or nearly lost) a warranty/back-charge claim because the evidence didn't hold up?"
  - "How do you pay your inspection vendor today — per site, per MW, per report? What's on the invoice?"
  - "Has a vendor ever charged a separate line for 'QA'd' or 'verified' output? Would that survive your
    procurement?" *(procurement/contract role answers the survivability half)*
- **A4 — federal chain-of-custody:**
  - "Have you seen an RFP or contract require provenance / chain-of-custody / auditable evidence for
    inspection data? Can you show me the language?"
  - "Beyond NDAA/Buy-American, what actually gets evaluated on inspection-data contracts?"

**Close:** "Who else should I be talking to?" (always get a referral). Only if they ask: a two-sentence
"here's what I'm exploring," then stop.

---

## 6. Decision framework (green / re-think thresholds)

Small-n qualitative — these are directional, scar-counted, not statistical.

| # | ✅ Validated (green) | 🔴 Re-think (red) |
|---|---|---|
| **A1** | ≥2 interviewees point to a **named standard in an actual artifact** (contract/RFP/warranty/IE scope), or an IE confirms they require standards-classed thermography. | No artifact; standard is "nice to have," no one's contract names it. |
| **A2** | ≥3 operators describe a **real handoff breakdown with a number** (% of findings lost, days delayed); ≥1 attaches a cost. | Operators say findings reliably close today; their existing process/CMMS already handles it. |
| **A3** | ≥3 show a **money-backed scar** from un-defensible evidence **and** don't recoil at a "verified output" line item; ≥1 already pays (or would pay) a premium for QA/defensibility. | Output treated as commodity, priced on volume; a verified premium "wouldn't survive procurement." |
| **A4** | A GovCon advisor or federal buyer points to an **RFP/contract clause** requiring provenance/auditable evidence, or confirms it's an evaluated factor. | NDAA/Buy-American is the only hard gate; evidence chain-of-custody is unspecified. |

**What each outcome does to canon:**
- **A3 green** → lock per-verified-WO / per-verified-MW pricing (GTM-STRATEGY §9); it's no longer a hypothesis.
- **A3 red** → open a new CR to revert pricing to capacity-based and reposition verification as a feature;
  this gates everything, so resolve it first.
- **A1 / A2 / A4** → update the relevant GTM-STRATEGY section and flip the §12 item from "validate" to a
  stated finding (with the evidence); a reversal large enough to change a locked decision gets its own CR.

---

## 7. Synthesis & cadence

One row per interview, tagged the same day:

| Date | Segment | Role | A1 | A2 | A3 | A4 | Scar? ($ / artifact) | Killer quote | Referral |
|---|---|---|---|---|---|---|---|---|---|

For each A-cell: `scar` (money/artifact-backed), `soft` (opinion only), `none`, or `n/a`. Weekly, tally the
**scar count** per assumption against the §6 thresholds. **Checkpoints:** re-weight after ~10 interviews;
make the go / re-think call after ~15 (or sooner if A3 is clearly red). Log findings back into
`GTM-STRATEGY.md` §12 as they firm up.

---

## 8. Outreach

- **Channels:** warm intros (investors/advisors) first; SEIA / Amicus O&M Cooperative networks; lender IE
  firms; LinkedIn to O&M directors & asset managers; the NDAA-transition angle as a timely opener.
- **Cold message (research framing, no pitch):** *"I'm doing research on how solar O&M teams turn inspection
  findings into maintenance action — specifically where findings get lost between the drone and the work
  order. Not selling anything; I'd value 20–30 min of how your team actually does it. Open to a short call?"*
- **Warm-intro ask:** *"Looking to learn how [their] team handles the inspection-finding → work-order
  handoff and warranty evidence. Pure research, no pitch. Could you introduce me to your O&M / asset-
  management contact?"*

---

## 9. Risks to the discovery itself

| Risk | Mitigation |
|---|---|
| Access (hard-to-reach buyers) | Warm intros + the dated NDAA opener; IE firms and cooperatives as aggregated access points. |
| Confirmation bias (founder hears what they want) | Past-tense + artifact questions only; count scars not nods; explicitly hunt for disconfirming evidence. |
| Wrong role (feature pain ≠ budget) | Pair the pain-feeler (O&M) with the signer (procurement / IE) per assumption. |
| Small-n over-reading | Treat as directional; require a *threshold* of independent scars, not one vivid anecdote. |
| Pitching leaks in | Scripted no-pitch open; the "what are you building" answer is deferred to the close. |

---

## Appendix — assumption → the single sharpest question

- **A1:** "Can you point me to where a thermography standard is *written* in a contract/RFP/warranty?"
- **A2:** "Of your last inspection's findings, how many became tracked work orders — and what happened to
  the rest?"
- **A3:** "Tell me about the last disputed finding or false truck roll — what did it cost, and who paid?"
- **A4:** "Have you seen an RFP require chain-of-custody for inspection data? Can you show me the clause?"
