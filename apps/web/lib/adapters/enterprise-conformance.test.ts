import { describe, it, expect } from "vitest";
import type { DeliveryAdapter, AuthStrategy, DeliveryResult, DeliveryTarget } from "@dz/adapters";

/**
 * Guard B (M2-PREP, CR-21 / CR-05): a future SAP-OData or Maximo-OSLC adapter must slot behind the
 * SAME routing interface with OAuth2 client-credentials auth + async/batch dispatch. This proves the
 * seam supports it — the object below typechecks as a DeliveryAdapter — WITHOUT building or
 * registering a real native adapter (it is a noop, never added to the registry).
 */
const noopEnterpriseAdapter: DeliveryAdapter = {
  targetType: "NOOP_ENTERPRISE_ODATA",
  authStrategy: { kind: "OAUTH2_CLIENT_CREDENTIALS", tokenUrl: "https://example.invalid/oauth/token", scopes: ["work-orders.write"] },
  supportsBatch: true,
  async deliver(_payload: unknown, _target: DeliveryTarget): Promise<DeliveryResult> {
    return { ok: false, status: 501, downstreamRef: null, retryable: false };
  },
  async deliverBatch(payloads: unknown[], _target: DeliveryTarget): Promise<DeliveryResult[]> {
    return payloads.map(() => ({ ok: false, status: 501, downstreamRef: null, retryable: false }));
  },
};

describe("adapter seam covers enterprise transport (Guard B, CR-05)", () => {
  it("an OAuth2 + batch adapter conforms to the DeliveryAdapter interface", () => {
    expect(noopEnterpriseAdapter.authStrategy?.kind).toBe("OAUTH2_CLIENT_CREDENTIALS");
    expect(noopEnterpriseAdapter.supportsBatch).toBe(true);
    expect(typeof noopEnterpriseAdapter.deliverBatch).toBe("function");
  });

  it("all three auth strategies are expressible", () => {
    const strategies: AuthStrategy[] = [
      { kind: "STATIC_TOKEN" },
      { kind: "OAUTH2_CLIENT_CREDENTIALS", tokenUrl: "https://x/token" },
      { kind: "MTLS" },
    ];
    expect(strategies.map((s) => s.kind)).toEqual(["STATIC_TOKEN", "OAUTH2_CLIENT_CREDENTIALS", "MTLS"]);
  });

  it("batch dispatch returns one result per payload", async () => {
    const res = await noopEnterpriseAdapter.deliverBatch!([{}, {}], { config: {}, secretVaultKey: "vault/ref" });
    expect(res).toHaveLength(2);
    expect(res.every((r) => r.status === 501)).toBe(true);
  });

  it("credentials ride via secretVaultKey, never inline in config", () => {
    const target: DeliveryTarget = { config: { url: "https://enterprise.example/odata" }, secretVaultKey: "datumzero/sap/oauth" };
    expect(target.secretVaultKey).toBe("datumzero/sap/oauth");
    expect(JSON.stringify(target.config)).not.toMatch(/token|secret|password/i);
  });
});
