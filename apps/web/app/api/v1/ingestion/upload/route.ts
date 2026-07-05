import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma, CaptureModality } from "@dz/db";
import { storage } from "@dz/storage";
import { bindAirframe } from "@/lib/ingestion/airframe-binding";

// Needs Node APIs (Buffer, crypto, storage SDK) — not the edge runtime.
export const runtime = "nodejs";

const MODALITIES = new Set<string>(Object.values(CaptureModality));

function badRequest(message: string) {
  return NextResponse.json({ error: "bad_request", message }, { status: 400 });
}

/** Minimal bearer-token auth for the M0 ingestion stub. Fails closed if unconfigured. */
function authorize(req: NextRequest): boolean {
  const token = process.env.INGEST_API_TOKEN;
  if (!token) return false; // no configured token → reject everything (fail closed)
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * M0-04 — Ingestion stub (CR-11).
 *
 * Authenticated upload of a capture + metadata. The pipeline FAILS CLOSED before any row is
 * written: the airframe serial must match a VERIFIED entry in the registry (CR-11). Only then
 * do we write bytes through the StoragePort and create IngestionSession + MediaAsset.
 */
export async function POST(req: NextRequest) {
  if (process.env.INGEST_API_TOKEN === undefined) {
    return NextResponse.json(
      { error: "ingestion_unconfigured", message: "INGEST_API_TOKEN is not set; failing closed." },
      { status: 503 },
    );
  }
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "unsupported_media_type", message: "expected multipart/form-data" }, { status: 415 });
  }

  const organizationId = String(form.get("organizationId") ?? "").trim();
  const modality = String(form.get("modality") ?? "").trim();
  const airframeSerial = String(form.get("airframeSerial") ?? "").trim();
  const capturedAtRaw = String(form.get("capturedAt") ?? "").trim();
  const file = form.get("file");

  if (!organizationId) return badRequest("organizationId is required");
  if (!MODALITIES.has(modality)) return badRequest(`unknown modality: ${modality || "(none)"}`);
  if (!(file instanceof File)) return badRequest("file is required (multipart field 'file')");
  const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : new Date();
  if (Number.isNaN(capturedAt.getTime())) return badRequest("capturedAt is not a valid date");

  // Tenant guard: the organization must exist (multi-tenant native).
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) return NextResponse.json({ error: "unknown_organization" }, { status: 404 });

  // --- CR-11 FAIL CLOSED: bind to a verified airframe BEFORE persisting anything ---
  const binding = await bindAirframe({ organizationId, airframeSerial });
  if (!binding.ok) {
    return NextResponse.json(
      { error: "airframe_unverified", reason: binding.reason, message: binding.message },
      { status: 422 },
    );
  }

  // --- write bytes through the StoragePort seam (S3/MinIO default, local fallback) ---
  const store = storage();
  const bytes = Buffer.from(await file.arrayBuffer());
  const sessionId = globalThis.crypto.randomUUID();
  const safeName = (file.name || "capture.bin").replace(/[^A-Za-z0-9._-]/g, "_");
  const key = `org/${organizationId}/ingest/${sessionId}/${safeName}`;
  const stored = await store.put({
    key,
    body: bytes,
    contentType: file.type || "application/octet-stream",
    metadata: { organizationId, modality, airframeSerial },
  });

  // --- persist session + media (only reached when the airframe is verified) ---
  const session = await prisma.ingestionSession.create({
    data: {
      id: sessionId,
      organizationId,
      modality: modality as CaptureModality,
      pilotOrNodeId: binding.pilotId,
      rawStoragePath: stored.storagePath,
      boundHardwareId: binding.hardwareId,
      // Mirrors the verified airframe — never hardcoded; only verified captures reach here (CR-11).
      isNdaaVerified: binding.isNdaaVerified,
      mediaAssets: {
        create: {
          fullStoragePath: stored.storagePath,
          capturedAt,
        },
      },
    },
    include: { mediaAssets: { select: { id: true } } },
  });

  return NextResponse.json(
    {
      ingestionSessionId: session.id,
      mediaAssetId: session.mediaAssets[0]?.id ?? null,
      isNdaaVerified: session.isNdaaVerified,
      boundHardwareId: session.boundHardwareId,
      approvedListRef: binding.approvedListRef,
      storage: { driver: store.driver, path: stored.storagePath, bytes: stored.size },
    },
    { status: 201 },
  );
}
