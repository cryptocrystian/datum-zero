import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// M2-7c — the REAL-TRIGGER DoD against the composed stack. Runs ONLY in CI (the `images` job) after
// `docker compose up`, driving everything black-box over HTTP against the containers. Kept out of the
// hermetic unit suite and the host e2e job (those have no containers).
const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": appDir } },
  test: {
    environment: "node",
    include: ["e2e/**/*.composed.e2e.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
