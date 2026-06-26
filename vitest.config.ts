import { defineConfig } from "vitest/config";

/**
 * PURE UNIT TESTS ONLY — no database. CI runs `pnpm test` (vitest run) with NO
 * DB available. Any DB-touching tests must be named `*.integration.test.ts`;
 * they are excluded here so they never run in CI.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "node_modules/**"],
  },
});
