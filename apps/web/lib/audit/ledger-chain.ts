import { createHash } from "node:crypto";

/**
 * M2-9a — PURE hash-chain math for the tamper-evident audit ledger (CR-41).
 *
 * No DB imports: the integrity logic is unit-testable without a database (or a generated Prisma
 * client). The DB append/verify I/O lives in ./ledger and builds on these functions.
 *
 * Each ledger entry chains to the prior one (per org): contentHash = SHA-256(prevHash || canonical(core)).
 * Any post-hoc edit — a tampered payload, a rewired link, a deleted entry — breaks the chain, which
 * `verifyChain` detects.
 */

export type LedgerEntryType = "MODEL_CALLBACK" | "QA_APPROVAL" | "QA_REJECTION";

/** The core fields a ledger entry commits to — exactly what contentHash covers. */
export interface AuditCore {
  organizationId: string;
  anomalyId: string | null;
  entryType: LedgerEntryType;
  payload: unknown;
}

/** Sentinel mixed into the first entry's hash so a genesis entry cannot be confused with a linked one. */
export const GENESIS = "GENESIS";

/** Deterministic, key-sorted JSON so the same logical payload always hashes identically. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(o[k]);
        return acc;
      }, {});
  }
  return value;
}

/** PURE: the content hash for an entry, linking it to the previous entry's hash (genesis = null). */
export function contentHashOf(prevHash: string | null, core: AuditCore): string {
  const canonicalCore = canonicalize({
    organizationId: core.organizationId,
    anomalyId: core.anomalyId,
    entryType: core.entryType,
    payload: core.payload,
  });
  return createHash("sha256")
    .update(`${prevHash ?? GENESIS}\n${canonicalCore}`)
    .digest("hex");
}

export interface ChainEntry extends AuditCore {
  contentHash: string;
  prevHash: string | null;
}

export interface ChainVerification {
  ok: boolean;
  /** 0-based index of the first entry that fails (hash mismatch or broken link); null if ok. */
  brokenAt: number | null;
  reason: string | null;
}

/**
 * PURE: verify an ordered (oldest → newest) slice of one org's chain. For each entry it checks that
 * (a) prevHash equals the running previous contentHash (genesis = null), and (b) the stored
 * contentHash recomputes from (prevHash, core). The first failure is reported — a tampered payload,
 * a rewired link, or a deleted entry (the gap breaks the next link) all surface here.
 */
export function verifyChain(entries: ChainEntry[]): ChainVerification {
  let prev: string | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if ((e.prevHash ?? null) !== prev) {
      return { ok: false, brokenAt: i, reason: "broken link: prevHash does not match the prior entry's contentHash" };
    }
    if (contentHashOf(prev, e) !== e.contentHash) {
      return { ok: false, brokenAt: i, reason: "content mismatch: entry was altered after it was written" };
    }
    prev = e.contentHash;
  }
  return { ok: true, brokenAt: null, reason: null };
}
