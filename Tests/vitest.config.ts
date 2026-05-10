import { defineConfig } from "vitest/config";

const isCI = !!process.env.CI;

export default defineConfig({
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "node_modules",
      "dist",
      ".git",
      ...(isCI ? [] : ["**/mysql.test.ts", "**/postgres.test.ts", "**/s3.test.ts"]),
    ],
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["../Packages/**/src/**"],
    },
    pool: "threads",
    isolate: true,
  },
});
