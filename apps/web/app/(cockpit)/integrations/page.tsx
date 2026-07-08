import { runWithOrg } from "@dz/db";
import { requireSession } from "@/lib/session";
import { listIntegrations, CONFIG_FIELDS, TARGET_TYPES } from "@/lib/integrations/admin";
import { IntegrationsConfig } from "./IntegrationsConfig";

// Live integration list — reflects DB state after each mutation.
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  // Validate the session at the DAL, independent of the layout (M1-01/0a, CR-20).
  const session = await requireSession();
  const orgId = session.organizationId;
  const canEdit = session.role === "ADMIN";

  const integrations = await runWithOrg(orgId, async () => listIntegrations(orgId));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between border-b border-datum-slate/25 pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-white">Integrations</h1>
          <p className="mt-1 max-w-2xl text-xs uppercase tracking-wider text-datum-slate">
            Delivery targets your RuleSet policies route to. Non-secret settings only — credentials are
            provisioned out-of-band in the vault and referenced by key.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold text-tactical-gold">
            {String(integrations.length).padStart(2, "0")}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-datum-slate">
            {canEdit ? "Targets · ADMIN" : "Targets · read-only"}
          </div>
        </div>
      </header>

      <IntegrationsConfig
        integrations={integrations}
        canEdit={canEdit}
        targetTypes={TARGET_TYPES}
        configFields={CONFIG_FIELDS}
      />
    </div>
  );
}
