import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// End-to-end DoD test. Needs Postgres + Redis; runs SEPARATELY from the pure unit suite
// (`pnpm test`) so the unit tests stay hermetic. The @/ alias lets the e2e drive the real
// Next route handlers.
const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": appDir } },
  test: {
    environment: "node",
    include: ["e2e/**/*.e2e.ts"],
    testTimeout: 45_000,
    hookTimeout: 45_000,
    fileParallelism: false,
  },
});
