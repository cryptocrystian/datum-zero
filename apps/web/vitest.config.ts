import { defineConfig } from "vitest/config";

// Unit tests for pure library logic (no jsx / DOM). Keep them under lib/**.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
