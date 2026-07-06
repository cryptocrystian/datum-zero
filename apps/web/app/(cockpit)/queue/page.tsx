import { getCurrentOrgId, getCurrentReviewer } from "@/lib/session";
import { listReviewQueue, listOrgAssets, listOrgIntegrations } from "@/lib/qa/review";
import { ReviewQueue } from "./ReviewQueue";

// Always render the live queue (no caching) — it reflects DB state after each review action.
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const orgId = getCurrentOrgId();
  const reviewer = getCurrentReviewer();
  const [items, assets, integrations] = await Promise.all([
    listReviewQueue(orgId),
    listOrgAssets(orgId),
    listOrgIntegrations(orgId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between border-b border-datum-slate/25 pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-white">Validation Queue</h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-datum-slate">
            Manual QA gate — measurements + recommendations. The reviewer adjudicates; nothing dispatches
            without approval.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold text-tactical-gold">
            {String(items.length).padStart(2, "0")}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-datum-slate">
            Awaiting review · {reviewer.name}
          </div>
        </div>
      </header>

      <ReviewQueue items={items} assets={assets} integrations={integrations} />
    </div>
  );
}
