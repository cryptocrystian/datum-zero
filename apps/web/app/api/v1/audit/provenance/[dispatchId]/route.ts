import { NextRequest, NextResponse } from "next/server";
import { runWithOrg } from "@dz/db";
import { getSession } from "@/lib/session";
import { getProvenance } from "@/lib/audit/provenance";

export const runtime = "nodejs";

/**
 * M0-11 — GET the full provenance chain for a dispatched work order in ONE call (CR-12).
 * Authoritative auth check (CR-20): 401 without a real session; org-scoped to the session's tenant
 * (a dispatch outside the org 404s).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dispatchId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { dispatchId } = await params;
  const chain = await runWithOrg(session.organizationId, async () =>
    getProvenance(dispatchId, session.organizationId),
  );
  if (!chain) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(chain);
}
