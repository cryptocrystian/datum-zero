"use server";

import { revalidatePath } from "next/cache";
import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { approveAnomaly, rejectAnomaly, bindAnomalyToAsset } from "@/lib/qa/review";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * DAL rule (M1-01/0a, CR-20): every mutation independently validates the session against the DB
 * (requireSession → auth() → DB) and derives org + reviewer from it — NEVER trusting the middleware
 * cookie gate or that the page layout rendered. Org scope + reviewer identity come only from here.
 * The mutation then runs inside runWithOrg so Postgres RLS scopes it to the tenant (M1-02).
 */
export async function approveAction(anomalyId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await runWithOrg(session.organizationId, async () => {
      await approveAnomaly(anomalyId, session.organizationId, session.userId);
    });
    revalidatePath("/queue");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "approve failed" };
  }
}

export async function rejectAction(anomalyId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await runWithOrg(session.organizationId, async () => {
      await rejectAnomaly(anomalyId, session.organizationId, session.userId);
    });
    revalidatePath("/queue");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "reject failed" };
  }
}

export async function bindAction(anomalyId: string, assetId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await runWithOrg(session.organizationId, async () => {
      await bindAnomalyToAsset(anomalyId, session.organizationId, assetId);
    });
    revalidatePath("/queue");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "bind failed" };
  }
}
