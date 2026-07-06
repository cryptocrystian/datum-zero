"use server";

import { revalidatePath } from "next/cache";
import { getCurrentOrgId, getCurrentReviewer } from "@/lib/session";
import { approveAnomaly, rejectAnomaly, bindAnomalyToAsset } from "@/lib/qa/review";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function approveAction(anomalyId: string): Promise<ActionResult> {
  try {
    const [orgId, reviewer] = await Promise.all([getCurrentOrgId(), getCurrentReviewer()]);
    await approveAnomaly(anomalyId, orgId, reviewer.id);
    revalidatePath("/queue");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "approve failed" };
  }
}

export async function rejectAction(anomalyId: string): Promise<ActionResult> {
  try {
    const [orgId, reviewer] = await Promise.all([getCurrentOrgId(), getCurrentReviewer()]);
    await rejectAnomaly(anomalyId, orgId, reviewer.id);
    revalidatePath("/queue");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "reject failed" };
  }
}

export async function bindAction(anomalyId: string, assetId: string): Promise<ActionResult> {
  try {
    await bindAnomalyToAsset(anomalyId, await getCurrentOrgId(), assetId);
    revalidatePath("/queue");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "bind failed" };
  }
}
