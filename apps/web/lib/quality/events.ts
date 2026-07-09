/**
 * Capture-quality persistence + read model (M2-1d, CR-11/CR-22/CR-25). Server-only (imports Prisma +
 * node:crypto). Every query is organizationId-scoped (multi-tenant native) and runs under the RLS
 * GUC via `runWithOrg` at the call site. A CaptureQualityEvent records a REJECTED capture — it is
 * NEVER turned into an Anomaly or a WorkOrderDispatch (no dispatch path exists by construction).
 */
import { createHash } from "node:crypto";
import { prisma } from "@dz/db";
import {
  type CaptureQualityEventDTO,
  type CaptureQualityInput,
  toCaptureQualityEventDTO,
} from "./reason";

/** Stable id from session+status so an inference re-delivery upserts instead of duplicating. */
export function captureQualityEventId(ingestionSessionId: string, status: string): string {
  const h = createHash("sha256").update(`cqe:${ingestionSessionId}:${status}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Persist (idempotent) the data-quality outcome. Creates NO anomaly and NO dispatch (fail closed). */
export async function recordCaptureQualityEvent(input: CaptureQualityInput): Promise<{ id: string }> {
  const id = captureQualityEventId(input.ingestionSessionId, input.status);
  const data = {
    organizationId: input.organizationId,
    ingestionSessionId: input.ingestionSessionId,
    status: input.status,
    reason: input.reason,
    manufacturer: input.manufacturer,
    model: input.model,
    detectedFormat: input.detectedFormat,
  };
  return prisma.captureQualityEvent.upsert({
    where: { id },
    update: data,
    create: { id, ...data },
    select: { id: true },
  });
}

/** Cockpit read model: this org's capture-quality events, newest first. org-scoped (RLS + filter). */
export async function listCaptureQualityEvents(organizationId: string): Promise<CaptureQualityEventDTO[]> {
  const rows = await prisma.captureQualityEvent.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      ingestionSessionId: true,
      status: true,
      reason: true,
      manufacturer: true,
      model: true,
      detectedFormat: true,
      createdAt: true,
    },
  });
  return rows.map(toCaptureQualityEventDTO);
}
