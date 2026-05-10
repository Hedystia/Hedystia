import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  unbundle: true,
  outputOptions: { exports: "named" },
  deps: { neverBundle: ["@hedystia/validations", "bun"] },
});
