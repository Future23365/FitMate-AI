import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
    tsconfigPaths: true,
  },
  test: {
    clearMocks: true,
    environment: "node",
    include: ["manual-tests/llm/**/*.test.ts"],
    restoreMocks: true,
    testTimeout: 180_000,
  },
});
