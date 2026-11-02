import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/server.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: false,
  treeshake: true,
  clean: true,
  unbundle: true,
  outputOptions: { exports: "named" },
});
