import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["apps/radar-worker/test/**/*.test.ts"],
  },
});
