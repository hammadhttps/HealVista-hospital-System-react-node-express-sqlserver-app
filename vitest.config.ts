import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["apps/server/src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      include: ["apps/server/src/**/*.service.ts"],
    },
  },
});
