import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";

// Singletons (avoid exhausting connections / re-creating the ALS during dev hot-reload).
const globalForPrisma = globalThis as unknown as {
  basePrisma?: PrismaClient;
  orgContext?: AsyncLocalStorage<string>;
};

/**
 * AsyncLocalStorage carries the authenticated organizationId through the async call tree so the
 * RLS extension can set `app.current_org` on every tenant query WITHOUT threading org through
 * every function signature. Entry points wrap their tenant work in `runWithOrg(orgId, fn)`.
 */
const orgContext = globalForPrisma.orgContext ?? new AsyncLocalStorage<string>();

const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.basePrisma = basePrisma;
  globalForPrisma.orgContext = orgContext;
}

/**
 * RLS bridge (M1-02, CR-20) — defense-in-depth BEHIND the app-layer organizationId filters, never a
 * replacement. When an org context is bound, wrap each query in a transaction that first sets the
 * transaction-local GUC `app.current_org`; Postgres RLS policies then scope the query to the tenant.
 * With no context bound (auth substrate reads, health checks) the query runs unwrapped — the auth
 * tables are RLS-exempt, and any tenant table hit without a context fails closed (RLS → zero rows).
 */
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const organizationId = orgContext.getStore();
        if (!organizationId) return query(args);
        // Batch the GUC + the operation into ONE transaction (shared engine) so set_config —
        // transaction-local — governs the query. Return the operation's result (index 1).
        const [, result] = await basePrisma.$transaction([
          basePrisma.$executeRaw`SELECT set_config('app.current_org', ${organizationId}, true)`,
          query(args),
        ]);
        return result;
      },
    },
  },
});

/**
 * Bind the tenant org for the duration of `fn` so every Prisma tenant query inside runs with
 * `app.current_org` set (RLS-scoped). Nesting is allowed — the innermost org wins.
 */
export function runWithOrg<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  return orgContext.run(organizationId, fn);
}

export * from "@prisma/client";
