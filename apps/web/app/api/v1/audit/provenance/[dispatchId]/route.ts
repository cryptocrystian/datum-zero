import { NextRequest, NextResponse } from "next/server";
import { getCurrentOrgId } from "@/lib/session";
import { getProvenance } from "@/lib/audit/provenance";

export const runtime = "nodejs";

/**
 * M0-11 — GET the full provenance chain for a dispatched work order in ONE call (CR-12).
 * Org-scoped to the current tenant (stub session in M0); a dispatch outside the org 404s.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dispatchId: string }> },
) {
  const { dispatchId } = await params;
  const chain = await getProvenance(dispatchId, getCurrentOrgId());
  if (!chain) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(chain);
}
