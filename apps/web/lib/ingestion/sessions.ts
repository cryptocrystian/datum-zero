import { prisma } from "@dz/db";

/**
 * M2-7/CR-36 — inference-processing observability. A capture must NEVER vanish into the queue: a
 * session whose inference FAILED (exhausted retries) is surfaced to the operator so it is visible and
 * actionable, never silently dropped. Org-scoped (RLS-backed).
 */
export interface FailedSessionDTO {
  id: string;
  rawStoragePath: string;
  processingStatus: string;
  createdAt: string;
}

export async function listFailedInferenceSessions(organizationId: string): Promise<FailedSessionDTO[]> {
  const rows = await prisma.ingestionSession.findMany({
    where: { organizationId, processingStatus: "FAILED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, rawStoragePath: true, processingStatus: true, createdAt: true },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    rawStoragePath: r.rawStoragePath,
    processingStatus: r.processingStatus ?? "FAILED",
    createdAt: r.createdAt.toISOString(),
  }));
}
