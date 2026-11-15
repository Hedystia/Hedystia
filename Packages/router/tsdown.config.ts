import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/vite.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  unbundle: true,
  outputOptions: { exports: "named" },
  deps: { neverBundle: ["@hedystia/view", "@hedystia/query", "vite"] },
});
