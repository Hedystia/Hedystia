import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/jsx-runtime.ts",
    "src/jsx-dev-runtime.ts",
    "src/vite.ts",
    "src/server/index.ts",
    "src/static/jsx-runtime.ts",
    "src/static/jsx-dev-runtime.ts",
    "src/build/index.ts",
    "src/islands/index.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  unbundle: true,
  outputOptions: { exports: "named" },
});
