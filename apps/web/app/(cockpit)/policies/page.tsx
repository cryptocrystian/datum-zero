import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { listRuleSets, listAllowedRouteTargets, MODALITIES, OPERATORS, SUPPORTED_TRIGGER_METRICS } from "@/lib/rules/ruleset-admin";
import { PolicyBuilder } from "./PolicyBuilder";

// Live policy list — reflects DB state after each mutation.
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  // Validate the session at the DAL, independent of the layout (M1-01/0a, CR-20).
  const session = await requireSession();
  const orgId = session.organizationId;
  const canEdit = session.role === "ADMIN";

  const [policies, routeTargetOptions] = await runWithOrg(orgId, async () =>
    Promise.all([listRuleSets(orgId), listAllowedRouteTargets(orgId)]),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between border-b border-datum-slate/25 pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-white">RuleSet Policy</h1>
          <p className="mt-1 max-w-2xl text-xs uppercase tracking-wider text-datum-slate">
            Client policy over the model&apos;s classification — configures the ΔT escalation, routing, and
            recommendation. The model owns the anomaly type; the reviewer adjudicates dispatch.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold text-tactical-gold">
            {String(policies.length).padStart(2, "0")}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-datum-slate">
            {canEdit ? "Policies · ADMIN" : "Policies · read-only"}
          </div>
        </div>
      </header>

      <PolicyBuilder
        policies={policies}
        canEdit={canEdit}
        routeTargetOptions={routeTargetOptions}
        modalities={MODALITIES}
        operators={[...OPERATORS]}
        triggerMetrics={[...SUPPORTED_TRIGGER_METRICS]}
      />
    </div>
  );
}
