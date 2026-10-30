import { prisma, AuditEntryType, Prisma } from "@dz/db";
import { type AuditCore, type ChainEntry, type ChainVerification, type LedgerEntryType, contentHashOf, verifyChain } from "./ledger-chain";

/**
 * M2-9a — tamper-evident audit ledger (CR-41): the DB append/verify I/O over the pure hash-chain math
 * in ./ledger-chain.
 *
 * Append-only, hash-chained determination log that hardens CR-12's immutable audit trail. Append-only
 * is DB-enforced — the runtime role has no UPDATE/DELETE on this table (see the M2-9a migration's
 * REVOKE). KMS signing (non-repudiation) + external anchoring (RFC-3161 / OpenTimestamps) are later
 * slices (M2-9b/c), as is wiring `appendAuditEntry` into approve/reject + the inference callback.
 */

// Re-export the pure chain API so callers import ledger math + I/O from one place.
export * from "./ledger-chain";

/**
 * Append one entry to the org's chain. Reads the latest entry's contentHash as prevHash, computes
 * this entry's contentHash, and inserts. MUST be called with the transaction client from
 * `runSerializedOrgTx` (@dz/db): it sets the RLS GUC and holds a per-org advisory lock, so the
 * prevHash read + insert are serialized and commit atomically with the determination write that
 * precedes it in the same transaction. Returns the created entry's id + hashes.
 */
export async function appendAuditEntry(
  client: Prisma.TransactionClient,
  core: AuditCore,
): Promise<{ id: string; contentHash: string; prevHash: string | null }> {
  const latest = await client.auditLogEntry.findFirst({
    where: { organizationId: core.organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { contentHash: true },
  });
  const prevHash = latest?.contentHash ?? null;
  const contentHash = contentHashOf(prevHash, core);
  return client.auditLogEntry.create({
    data: {
      organizationId: core.organizationId,
      anomalyId: core.anomalyId,
      entryType: core.entryType as AuditEntryType,
      contentHash,
      prevHash,
      payload: core.payload as Prisma.InputJsonValue,
    },
    select: { id: true, contentHash: true, prevHash: true },
  });
}

/**
 * Verify the entire chain for an org — READ-ONLY, never mutates. Reads every entry oldest → newest
 * and runs the pure `verifyChain`. Returns the verification plus the number of entries checked.
 */
export async function verifyAuditChain(
  organizationId: string,
): Promise<ChainVerification & { entriesChecked: number }> {
  const rows = await prisma.auditLogEntry.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      organizationId: true,
      anomalyId: true,
      entryType: true,
      payload: true,
      contentHash: true,
      prevHash: true,
    },
  });
  const entries: ChainEntry[] = rows.map((r) => ({
    organizationId: r.organizationId,
    anomalyId: r.anomalyId,
    entryType: r.entryType as LedgerEntryType,
    payload: r.payload,
    contentHash: r.contentHash,
    prevHash: r.prevHash,
  }));
  return { ...verifyChain(entries), entriesChecked: entries.length };
}
