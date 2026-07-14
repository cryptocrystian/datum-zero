import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { listReviewQueue, listOrgAssets, listOrgIntegrations } from "@/lib/qa/review";
import { listCaptureQualityEvents, listUnsupportedFormatCounts } from "@/lib/quality/events";
import { listFailedInferenceSessions } from "@/lib/ingestion/sessions";
import { ReviewQueue } from "./ReviewQueue";
import { CaptureQualityStrip } from "./CaptureQualityStrip";
import { UnsupportedFormats } from "./UnsupportedFormats";
import { ProcessingFailures } from "./ProcessingFailures";

// Always render the live queue (no caching) — it reflects DB state after each review action.
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  // Validate the session at the DAL, independent of the layout (M1-01/0a, CR-20).
  const session = await requireSession();
  const orgId = session.organizationId;
  const reviewer = { id: session.userId, name: session.name ?? session.email ?? session.userId };
  const [items, assets, integrations, qualityEvents, unsupportedFormats, failedSessions] = await runWithOrg(
    orgId,
    async () =>
      Promise.all([
        listReviewQueue(orgId),
        listOrgAssets(orgId),
        listOrgIntegrations(orgId),
        listCaptureQualityEvents(orgId),
        listUnsupportedFormatCounts(orgId),
        listFailedInferenceSessions(orgId),
      ]),
  );

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

      {/* A capture must never vanish into the queue: inference failures are surfaced (M2-7, CR-36). */}
      <ProcessingFailures sessions={failedSessions} />

      {/* Distinct, non-anomaly section: captures rejected for a data-quality reason (M2-1d, CR-25). */}
      <CaptureQualityStrip events={qualityEvents} />

      {/* Demand signal: unsupported capture formats ranked by frequency (M2-1f, CR-22/CR-14). */}
      <UnsupportedFormats groups={unsupportedFormats} />
    </div>
  );
}
