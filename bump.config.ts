import { defineConfig } from "bumpp";
import { globSync } from "tinyglobby";

export default defineConfig({
  files: [
    "package.json",
    ...globSync(["./Packages/*/package.json", "./Packages/integrations/*/*/package.json"], {
      expandDirectories: false,
    }),
  ],
});
