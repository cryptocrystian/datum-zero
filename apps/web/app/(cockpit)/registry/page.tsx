import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { listAssets } from "@/lib/registry/asset-admin";
import { AssetRegistry } from "./AssetRegistry";

// Live registry — reflects DB state after each mutation/import. Server-side label search.
export const dynamic = "force-dynamic";

const TAKE = 200;

export default async function RegistryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  // Validate the session at the DAL, independent of the layout (M1-01/0a, CR-20).
  const session = await requireSession();
  const orgId = session.organizationId;
  const canEdit = session.role === "ADMIN";
  const q = (await searchParams).q?.trim() ?? "";

  const { assets, total } = await runWithOrg(orgId, async () => listAssets(orgId, { search: q || undefined, take: TAKE }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between border-b border-datum-slate/25 pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-white">Asset Registry</h1>
          <p className="mt-1 max-w-2xl text-xs uppercase tracking-wider text-datum-slate">
            The internalLabel spine — canonical labels + coordinates that spatially bind detections to
            assets. Seed from your as-built / SCADA export via bulk import.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold text-tactical-gold">{String(total).padStart(2, "0")}</div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-datum-slate">
            {q ? `Matching · ${canEdit ? "ADMIN" : "read-only"}` : `Assets · ${canEdit ? "ADMIN" : "read-only"}`}
          </div>
        </div>
      </header>

      <AssetRegistry assets={assets} total={total} shown={assets.length} take={TAKE} canEdit={canEdit} query={q} />
    </div>
  );
}
