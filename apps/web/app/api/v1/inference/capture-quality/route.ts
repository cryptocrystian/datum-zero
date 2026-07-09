import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma, runWithOrg } from "@dz/db";
import { parseCaptureQualityCallback } from "@/lib/quality/reason";
import { recordCaptureQualityEvent } from "@/lib/quality/events";

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

/**
 * M2-1d — capture-quality callback (CR-11, CR-22, CR-25). The DISTINCT inbound seam for the
 * radiometric data-quality outcome from the inference pipeline (M2-1b fail-closed) — deliberately
 * NOT the anomaly callback. It persists a session-scoped, org-scoped `CaptureQualityEvent` recording
 * a REJECTED capture, and creates NO Anomaly and NO WorkOrderDispatch (fail closed — no dispatch path
 * exists by construction). Org-scoped + idempotent. The reason is derived server-side (evidence-framed,
 * CR-12); the payload's own reason, if any, is ignored so cockpit copy can't drift.
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
  const parsed = parseCaptureQualityCallback(body);
  if (!parsed.ok) return badRequest(parsed.error);
  const input = parsed.value;

  // Bind the RLS org context for every tenant read/write below — defense-in-depth (M1-02, CR-20).
  return runWithOrg(input.organizationId, async () => {
    // Tenant guard: the session must exist AND belong to the claimed org (multi-tenant native).
    const session = await prisma.ingestionSession.findFirst({
      where: { id: input.ingestionSessionId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!session) return NextResponse.json({ error: "unknown_session" }, { status: 404 });

    const event = await recordCaptureQualityEvent(input);
    return NextResponse.json({ captureQualityEventId: event.id, status: input.status }, { status: 201 });
  });
}
