import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma, runWithOrg, SpatialBindingStatus } from "@dz/db";
import { bindUnboundAnomalies } from "@/lib/binding/spatial-binding";
import { applyPolicyToBoundAnomalies } from "@/lib/rules/classify";
import { validateInferenceCallback } from "@dz/adapters";

// Needs Node APIs (crypto, Prisma) — not the edge runtime.
export const runtime = "nodejs";

function badRequest(message: string) {
  return NextResponse.json({ error: "bad_request", message }, { status: 400 });
}

/** Shared-secret auth for the internal inference → web callback. Fails closed if unconfigured. */
function authorize(req: NextRequest): boolean {
  const token = process.env.INFERENCE_CALLBACK_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Stable UUID from a seed so re-posting the same detection upserts instead of duplicating. */
function deterministicUuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * DET-1c — inference callback + post-detection pipeline (CR-12, CR-15 amend, CR-16, CR-19).
 *
 * The callback persists the detector's evidence AND the MODEL's classification (CR-19 owns the type):
 * measurements + crops + modelVersion + standardRef + classification, created UNBOUND (assetId null,
 * spatialBindingStatus = UNBOUND_REVIEW). It then runs the pipeline as distinct stages via their
 * libraries: spatial binding (M0-06) resolves the assetId, then the RuleSet CLIENT POLICY (classify)
 * sets priority + routeTargets-linked recommendation on newly BOUND anomalies. The policy never
 * writes the model's classification/standardRef and never advances `status` (stays PENDING_QA); an
 * unbound anomaly is never routed or dispatched. Org-scoped and idempotent.
 */
export async function POST(req: NextRequest) {
  if (process.env.INFERENCE_CALLBACK_TOKEN === undefined) {
    return NextResponse.json(
      { error: "callback_unconfigured", message: "INFERENCE_CALLBACK_TOKEN is not set; failing closed." },
      { status: 503 },
    );
  }
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("expected a JSON body");

  // Pin the contract (packages/adapters/contracts/inference-callback.schema.json): validate the
  // inbound payload before any DB work — fail closed on a malformed/renamed field (CR-12).
  try {
    validateInferenceCallback(body);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "payload failed contract validation");
  }

  const ingestionSessionId = String(body.ingestion_session_id ?? "").trim();
  const organizationId = String(body.organization_id ?? "").trim();
  const modelVersion = String(body.model_version ?? "").trim();
  const media = body.media_asset ?? {};
  const d = body.detection ?? {};

  if (!ingestionSessionId) return badRequest("ingestion_session_id is required");
  if (!organizationId) return badRequest("organization_id is required");
  if (!modelVersion) return badRequest("model_version is required");
  if (!Array.isArray(d.bounding_box) || d.bounding_box.length !== 4) {
    return badRequest("detection.bounding_box must be [x1,y1,x2,y2]");
  }
  if (typeof d.confidence_score !== "number" || typeof d.metric_delta !== "number") {
    return badRequest("detection.confidence_score and metric_delta must be numbers");
  }
  if (!d.visual_crop_url || !d.analytics_crop_url) {
    return badRequest("detection crop URLs are required");
  }
  // DET-1c: the model owns the classification (CR-19). Fail closed if it did not classify.
  const classification = String(d.classification ?? "").trim();
  const standardRefIn = String(d.standard_ref ?? "").trim();
  if (!classification) return badRequest("detection.classification is required (model owns the type — CR-19)");
  if (!standardRefIn) return badRequest("detection.standard_ref is required (measurement anchor — CR-15)");

  // Bind the RLS org context for every tenant read/write below — defense-in-depth (M1-02, CR-20).
  return runWithOrg(organizationId, async () => {
    // Tenant guard: the session must exist AND belong to the claimed org (multi-tenant native).
    const session = await prisma.ingestionSession.findFirst({
      where: { id: ingestionSessionId, organizationId },
      select: { id: true },
    });
    if (!session) return NextResponse.json({ error: "unknown_session" }, { status: 404 });

    // Reuse the MediaAsset created at ingestion (M0-04); create one only if inference ran first.
    let mediaAsset = await prisma.mediaAsset.findFirst({
      where: { ingestionSessionId },
      select: { id: true },
    });
    if (!mediaAsset) {
      const fullStoragePath = String(media.full_storage_path ?? "").trim();
      const capturedAt = media.captured_at ? new Date(media.captured_at) : new Date();
      if (!fullStoragePath) return badRequest("media_asset.full_storage_path is required to create a MediaAsset");
      if (Number.isNaN(capturedAt.getTime())) return badRequest("media_asset.captured_at is not a valid date");
      mediaAsset = await prisma.mediaAsset.create({
        data: { ingestionSessionId, fullStoragePath, capturedAt },
        select: { id: true },
      });
    }

    const boundingBox = d.bounding_box.map((n: unknown) => Math.trunc(Number(n)));
    const anomalyId = deterministicUuid(`${ingestionSessionId}:${boundingBox.join(",")}`);

    // Evidence + the MODEL's classification (CR-19 owns the type). The client-POLICY layer
    // (priority / routeTargets / recommendation) is applied later by the rules lib on BOUND anomalies.
    const evidence = {
      organizationId,
      mediaAssetId: mediaAsset.id,
      boundingBox,
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      zAxisOffset: typeof d.z_axis_offset === "number" ? d.z_axis_offset : null,
      confidenceScore: d.confidence_score,
      metricDelta: d.metric_delta,
      metricUnit: d.metric_unit ?? null,
      // Measurement/classification layer — the model's authority (CR-19, CR-15).
      standardRef: standardRefIn,
      classification,
      visualCropUrl: String(d.visual_crop_url),
      analyticsCropUrl: String(d.analytics_crop_url),
      modelVersion,
      detectedFormat: typeof d.detected_format === "string" ? d.detected_format : null,
      iecCategory: typeof d.grounded_iec_category === "number" ? d.grounded_iec_category : null,
      requiresSafetyReview: typeof d.requires_safety_review === "boolean" ? d.requires_safety_review : null,
      geometryStatus: typeof d.geometry_status === "string" ? d.geometry_status : null,
      // CR-16: created unbound; M0-06 resolves assetId and flips this to BOUND.
      spatialBindingStatus: SpatialBindingStatus.UNBOUND_REVIEW,
      // status left at its PENDING_QA default; nothing dispatches while unbound (fail closed).
    };

    const anomaly = await prisma.anomaly.upsert({
      where: { id: anomalyId },
      update: evidence,
      create: { id: anomalyId, ...evidence },
      select: { id: true },
    });

    // Post-detection pipeline (distinct stages, each in its own lib): bind (M0-06) then apply the
    // client RuleSet POLICY to newly BOUND anomalies (DET-1c). status stays PENDING_QA; unbound
    // anomalies are never routed.
    await bindUnboundAnomalies(organizationId);
    await applyPolicyToBoundAnomalies(organizationId);

    const final = await prisma.anomaly.findFirst({
      where: { id: anomaly.id, organizationId },
      select: {
        id: true,
        spatialBindingStatus: true,
        status: true,
        modelVersion: true,
        classification: true,
        priority: true,
      },
    });

    return NextResponse.json(
      {
        anomalyId: final?.id,
        spatialBindingStatus: final?.spatialBindingStatus,
        status: final?.status,
        modelVersion: final?.modelVersion,
        classification: final?.classification,
        priority: final?.priority,
      },
      { status: 201 },
    );
  });
}
