import { describe, it, expect } from "vitest";
import { canonicalize, contentHashOf, verifyChain, type AuditCore, type ChainEntry } from "./ledger-chain";

/** Build a well-formed chain from a list of cores (what `appendAuditEntry` does, in-memory). */
function build(cores: AuditCore[]): ChainEntry[] {
  const out: ChainEntry[] = [];
  let prev: string | null = null;
  for (const c of cores) {
    const contentHash = contentHashOf(prev, c);
    out.push({ ...c, contentHash, prevHash: prev });
    prev = contentHash;
  }
  return out;
}

const core = (over: Partial<AuditCore> = {}): AuditCore => ({
  organizationId: "org1",
  anomalyId: "a1",
  entryType: "QA_APPROVAL",
  payload: { status: "APPROVED_DISPATCHED", reviewedById: "u1" },
  ...over,
});

describe("canonicalize — deterministic, key-order-independent", () => {
  it("hashes the same payload identically regardless of key order", () => {
    expect(canonicalize({ b: 1, a: 2, nested: { y: 1, x: 2 } })).toBe(
      canonicalize({ nested: { x: 2, y: 1 }, a: 2, b: 1 }),
    );
  });
});

describe("contentHashOf — links to prevHash", () => {
  it("a genesis entry differs from a linked entry with the same core", () => {
    const c = core();
    expect(contentHashOf(null, c)).not.toBe(contentHashOf("deadbeef", c));
  });
  it("is deterministic for the same (prevHash, core)", () => {
    const c = core();
    expect(contentHashOf("x", c)).toBe(contentHashOf("x", c));
  });
});

describe("verifyChain — append-only integrity (CR-41)", () => {
  it("accepts a well-formed chain", () => {
    const chain = build([
      core(),
      core({ entryType: "MODEL_CALLBACK", anomalyId: "a1", payload: { metricDelta: 18.4 } }),
      core({ entryType: "QA_REJECTION", anomalyId: "a2" }),
    ]);
    expect(verifyChain(chain)).toMatchObject({ ok: true, brokenAt: null });
  });

  it("detects a tampered payload (content mismatch)", () => {
    const chain = build([core(), core({ payload: { status: "APPROVED_DISPATCHED" } })]);
    // Alter the payload AFTER it was written, keeping the original hash — the recompute won't match.
    chain[1] = { ...chain[1], payload: { status: "REJECTED_FALSE_POSITIVE" } };
    const r = verifyChain(chain);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(1);
    expect(r.reason).toMatch(/altered/i);
  });

  it("detects a rewired link (prevHash forged)", () => {
    const chain = build([core(), core(), core()]);
    chain[2] = { ...chain[2], prevHash: "forged" };
    const r = verifyChain(chain);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(2);
    expect(r.reason).toMatch(/broken link/i);
  });

  it("detects a deleted middle entry (the gap breaks the next link)", () => {
    const chain = build([core(), core(), core()]);
    const gapped = [chain[0], chain[2]]; // entry 1 removed
    const r = verifyChain(gapped);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(1);
  });

  it("an empty chain is trivially valid", () => {
    expect(verifyChain([])).toMatchObject({ ok: true, brokenAt: null });
  });
});
