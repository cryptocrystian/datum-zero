import { NextRequest, NextResponse } from "next/server";
import { runWithOrg } from "@dz/db";
import { getSession } from "@/lib/session";
import { screenAirframe } from "@/lib/ingestion/airframe-binding";

// Needs Prisma (Node), not the edge runtime.
export const runtime = "nodejs";

/**
 * M1-06 — Infield Validator airframe pre-screen (CR-11, CR-20).
 *
 * AUTHENTICATED + org-scoped: the pilot must have a real session; the tenant derives from it and the
 * registry read runs RLS-scoped. Read-only convenience screen — the authoritative airframe bind
 * happens server-side at ingestion. Not an attestation; a verified serial is a screening signal.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const serial = (new URL(req.url).searchParams.get("serial") ?? "").trim();
  if (!serial) return NextResponse.json({ error: "bad_request", message: "serial is required" }, { status: 400 });

  const result = await runWithOrg(session.organizationId, async () =>
    screenAirframe(session.organizationId, serial),
  );
  return NextResponse.json(result);
}
