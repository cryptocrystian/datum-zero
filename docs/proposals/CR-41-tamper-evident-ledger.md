# CR-41 — Tamper-evident audit ledger (hardens CR-12)

**Status: MERGED to canon 2026-10-27** — now in `docs/PRD-Corrections-Log.md` (CR-41) and `MANIFEST.md`
(v1.5.0, §9, §7). This file is retained as the extended rationale + the `AuditLogEntry` model sketch + the
M2-8a/b/c ticket split; the PRD log row is the authoritative decision.

**Original status: DRAFT — not yet canon.** This is a drop-in proposal. Merging it means: (1) paste the §A row into
`docs/PRD-Corrections-Log.md`, (2) apply the §B MANIFEST edits **in the same commit** (CLAUDE.md rule), (3)
open the §D tickets. Nothing here is executed until you say so. Number: **CR-41** (CR-38/CR-40 taken by the
design work; 39 unused).

**One-line decision:** make CR-12's "immutable audit trail" concrete as *blockchain-derived cryptography
with no blockchain and no token* — an append-only hash-chained log + KMS signatures + an optional,
demand-gated external timestamp anchor. Rejects a private/consortium chain for now.

---

## A. Drop-in row for `docs/PRD-Corrections-Log.md`

> Paste as a single table row after CR-40. (Rendered here across lines for review; it is one row.)

| **CR-41** ✅ | **Tamper-evident audit ledger — CR-12 "immutable audit trail" made concrete (blockchain-*derived*, NO blockchain, NO token).** "Immutable" was a property, not a mechanism; the hardening is three layers. **(1) Append-only hash-chain** — a new additive `AuditLogEntry` (CR-27 additive-migration pattern) where each entry carries `prevHash` + `contentHash` (SHA-256 over the canonicalized determination payload: model callback output, and the QA `reviewedById`/`reviewedAt` approval), forming a per-org chain; **append-only enforced at the DB** — the runtime `datumzero_app` role is granted INSERT/SELECT only (no UPDATE/DELETE) on the audit table, mirroring the RLS dual-role posture (CR-20); org-scoped + RLS like every tenant table. **(2) KMS signatures** — each determination is signed with a KMS asymmetric key referenced by `secretVaultKey` (never in DB/logs/repo — secrets posture, CR-20); the signature + key id persist on the entry and CloudTrail logs every key use → non-repudiation ("who determined it, and that it is unaltered"). **(3) Optional external anchoring** — the chain's Merkle root is published at a configurable interval to an independent witness: an **eIDAS-qualified / RFC-3161 timestamp authority** (default; legally recognized) and/or a public-chain anchor via **OpenTimestamps**; the anchor receipt (TSA token / OTS proof + root + interval bounds) persists and surfaces on `getProvenance` (CR-27) and the future evidence surface. Anchoring is the ONLY layer that proves integrity **against DatumZero itself** and is an **optional, demand-gated compliance/evidence tier (CR-14), OFF by default.** **Additive + fail-closed:** layers 1–2 harden the existing trail (new migration, additive); verification is a pure `verifyAuditChain()` (recompute hashes, check signatures, check anchor) that NEVER mutates — a broken chain / failed signature is surfaced as an integrity alert, never silently repaired; no verdict language (CR-12). **Client-facing & marketing language is "cryptographically tamper-evident, independently timestamped audit trail" — NEVER "blockchain"** (raises more procurement risk flags than it soothes; marketing-posture discipline, CR-18). **Rejected for now:** a private/consortium blockchain — operator-run validators make it immutability *theater* (DatumZero still controls it) at large ops / SOC-2-surface / complexity cost, fighting the lean + RLS-Postgres + buy-don't-build posture (Commandment 10). **Reopen trigger:** a genuine multi-party consortium (asset owner + OEM + insurer + DatumZero sharing one authoritative record none hosts) — a specific-deal / Ring-3 case. **Open (🔎):** the specific anchoring provider + legal sufficiency per jurisdiction is demand-gated, not selected here. | CR-12 mandates an *immutable* audit trail but a signed, operator-controlled Postgres table defends against accidental mutation and rogue employees — **not** against the adversary that matters in a dispute: a hostile OEM or a regulator claiming DatumZero itself altered or back-dated the record. Immutability for that threat model is a **data-structure + external-anchoring** problem, not a consensus problem; the three layers deliver tamper-evidence, non-repudiation, and provable time against that adversary **without** the token/consensus baggage that is net-negative to the regulated-buyer trust posture (a token in the stack is a liability to the fail-closed, defensible sale). The EU AI Act deployer-traceability obligations (live 2026-08-02) turn this from a liability hedge into a sellable compliance tier; anchoring stays demand-gated (CR-14). Buy-don't-build holds: KMS + an RFC-3161 TSA + OpenTimestamps are bought/standard, not a hand-rolled chain. |

---

## B. MANIFEST changes required (same commit)

**Changelog (bump to 1.5.0), add at the top:**

> **Changelog — 1.5.0:** index CR-41 (tamper-evident audit ledger — hardens CR-12's immutable audit trail:
> append-only hash-chain + KMS signatures + optional external anchoring; **no blockchain, no token**).
> No commandment change.

**§9 Decision inheritance table** — extend the audit row:

| Area | Decisions |
|---|---|
| Headless vs. cockpit / QA gate | CR-06, CR-12 |
| Adjudication boundary & audit | CR-12, **CR-41** |

(If you prefer one row per area as-is, just append `, CR-41` to the CR-12 adjudication entry.)

**§7 Compliance, risk & security rules** — add one bullet under the adjudication boundary:

> - **Audit integrity (CR-41):** the CR-12 trail is append-only + hash-chained (DB-enforced, runtime role
>   has no UPDATE/DELETE), KMS-signed for non-repudiation, and — as an optional compliance tier — externally
>   anchored (RFC-3161 / OpenTimestamps) so integrity is provable against DatumZero itself. "Tamper-evident,"
>   never "blockchain," in client-facing copy.

**No commandment change.** Commandments 2–4 (evidence-not-verdict, evidence-language, 100% QA) and
Commandment 10 (buy/fine-tune, don't build) are reinforced, not altered.

---

## C. Schema & migration note

- New **additive** migration (per CLAUDE.md: migrations are immutable once committed — this is a NEW
  migration, never an edit to an existing one). Candidate model:

```prisma
model AuditLogEntry {
  id             String   @id @default(uuid())
  organizationId String   // tenant-scoped; RLS like every tenant table (CR-20)
  anomalyId      String?  // the determination this entry records (nullable for non-anomaly events)
  entryType      String   // MODEL_CALLBACK | QA_APPROVAL | QA_REJECTION | ...
  contentHash    String   // SHA-256 over the canonicalized determination payload
  prevHash       String?  // previous entry's contentHash → per-org hash chain (null = genesis)
  signature      String?  // KMS signature over contentHash
  kmsKeyId       String?  // key reference (id only; key material via secretVaultKey/KMS, never stored)
  anchorRef      String?  // TSA token / OpenTimestamps proof ref, once the root covering this entry is anchored
  createdAt      DateTime @default(now())

  @@index([organizationId, createdAt])
  @@index([anomalyId])
}
```

- Append-only is enforced by **grants**, not app convention: `datumzero_app` gets `INSERT, SELECT` only on
  `AuditLogEntry` (no `UPDATE`/`DELETE`), set in the RLS/role migration (CR-20 dual-role). The elevated
  migration role may still manage the table.
- `verifyAuditChain(organizationId, range?)` is a **pure** read function (recompute `contentHash`, check
  `prevHash` linkage, verify signatures via KMS, validate the anchor proof). It returns an integrity report;
  it never writes or repairs.

---

## D. Sequencing & guardrails (M2 drift-control format: one guardrail + one test per ticket)

Promote a **platform-hardening** track (independent of the GTM repositioning — this stands on CR-12 alone):

- **M2-8a** — Append-only hash-chained `AuditLogEntry` + migration + DB grants (no UPDATE/DELETE for runtime
  role) + `verifyAuditChain` (hash/linkage only). *Guardrail:* runtime role has no UPDATE/DELETE on the
  audit table; `verifyAuditChain` performs no writes.
- **M2-8b** — KMS signing of determinations + signature persistence + verification. *Guardrail:* no KMS key
  material in DB/logs/repo; every determination entry is signed.
- **M2-8c** — Optional external anchoring (RFC-3161 default; OpenTimestamps optional), demand-gated tier +
  anchor-receipt persistence + `getProvenance` surfacing. *Guardrail:* anchoring off by default; anchor
  receipt is verifiable; **no "blockchain" term in client-facing/marketing copy** (extend the CR-18 /
  verdict-language-style guard).

---

## E. How to merge

1. Paste §A into `docs/PRD-Corrections-Log.md` after CR-40.
2. Apply §B to `MANIFEST.md` (changelog bump + §9 row + §7 bullet) **in the same commit**.
3. Commit: `docs(canon): CR-41 tamper-evident audit ledger (hardens CR-12)` — reference the ticket when M2-8a opens.
4. Open M2-8a when the platform-hardening track is next promoted (not a re-baseline of M2-1…M2-7).
