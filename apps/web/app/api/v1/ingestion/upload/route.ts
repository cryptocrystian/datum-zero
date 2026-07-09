import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma, runWithOrg, CaptureModality } from "@dz/db";
import { storage } from "@dz/storage";
import { bindAirframe } from "@/lib/ingestion/airframe-binding";
import { evaluateEnvironment } from "@/lib/field/environment";
import { getSession } from "@/lib/session";

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
 * M0-04 ingestion (CR-11) — the AUTHORITATIVE server-side gate. Extended in M1-06 to dual-auth:
 *  • a signed-in pilot (session) — org derives from the session (RLS), used by the field PWA; or
 *  • a machine (bearer INGEST_API_TOKEN) — org from the form.
 *
 * FAILS CLOSED before any row is written: the airframe serial must match a VERIFIED registry entry
 * (CR-11) — else 422. Only then do we write bytes and create IngestionSession + MediaAsset. The
 * Infield Validator's client screen is a convenience pre-check; THIS is the real gate (two layers).
 */
export async function POST(req: NextRequest) {
  // Auth: a real pilot session takes precedence; otherwise require the machine bearer token.
  const session = await getSession();
  if (!session) {
    if (process.env.INGEST_API_TOKEN === undefined) {
      return NextResponse.json(
        { error: "ingestion_unconfigured", message: "INGEST_API_TOKEN is not set; failing closed." },
        { status: 503 },
      );
    }
    if (!authorize(req)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "unsupported_media_type", message: "expected multipart/form-data" }, { status: 415 });
  }

  // Session requests are org-scoped by the session (a pilot can never ingest into another tenant);
  // machine requests carry the org in the form.
  const organizationId = session ? session.organizationId : String(form.get("organizationId") ?? "").trim();
  const modality = String(form.get("modality") ?? "").trim();
  const airframeSerial = String(form.get("airframeSerial") ?? "").trim();
  const capturedAtRaw = String(form.get("capturedAt") ?? "").trim();
  const file = form.get("file");

  if (!organizationId) return badRequest("organizationId is required");
  if (!MODALITIES.has(modality)) return badRequest(`unknown modality: ${modality || "(none)"}`);
  if (!(file instanceof File)) return badRequest("file is required (multipart field 'file')");
  const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : new Date();
  if (Number.isNaN(capturedAt.getTime())) return badRequest("capturedAt is not a valid date");

  // Bind the RLS org context for the airframe lookup + tenant writes below (M1-02, CR-20).
  return runWithOrg(organizationId, async () => {
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

    // Environmental inspection-condition gate (M2-2b/CR-29) — session-level, flag-not-block. Optional
    // telemetry from the form; absent -> not evaluated (null). SCADA DC-load is an optional fallback.
    const numField = (v: FormDataEntryValue | null): number | null => {
      const str = typeof v === "string" ? v.trim() : "";
      const n = Number(str);
      return str !== "" && Number.isFinite(n) ? n : null;
    };
    const surfaceDryRaw = String(form.get("surfaceDry") ?? "").trim().toLowerCase();
    const scadaDc = numField(form.get("scadaDcLoadFraction"));
    const calibrationStatus = evaluateEnvironment(
      {
        irradianceWm2: numField(form.get("irradianceWm2")),
        windMs: numField(form.get("windMs")),
        cloudOktas: numField(form.get("cloudOktas")),
        surfaceDry: surfaceDryRaw === "true" ? true : surfaceDryRaw === "false" ? false : null,
      },
      scadaDc != null ? { dcLoadFraction: scadaDc } : null,
    );

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
        calibrationStatus, // M2-2b/CR-29 (null when no telemetry — not evaluated)
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
  });
}
