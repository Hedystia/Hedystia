import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { routerPlugin } from "@hedystia/router/vite";
import { viewPlugin } from "@hedystia/view/vite";
import { build } from "vite";
import { expect, it } from "vitest";
import { project } from "../helpers/project";

it("generates route types during a real Vite build and keeps unmatched pages in lazy chunks", async () => {
  const fixture = await project("router-production");
  try {
    await fixture.write(
      "index.html",
      '<html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
    );
    await fixture.write(
      "src/routes/index.tsx",
      'import {createRoute} from "@hedystia/router"; export const Route=createRoute("/", {component:()=> <h1>Home</h1>});',
    );
    await fixture.write(
      "src/routes/other.tsx",
      'import {createRoute} from "@hedystia/router"; export const Route=createRoute("/other", {component:()=> <h1>LAZY_PAGE_ONLY_MARKER</h1>});',
    );
    await fixture.write(
      "src/main.ts",
      'import {createRouter} from "@hedystia/router"; import {routeTree} from "./routeTree.gen"; createRouter({routes:routeTree}).mount(document.getElementById("app")!);',
    );
    const result = await build({
      root: fixture.root,
      configFile: false,
      logLevel: "silent",
      plugins: [...viewPlugin().plugins, routerPlugin()],
    });
    expect(await readFile(join(fixture.root, "src/routeTree.gen.ts"), "utf8")).toContain(
      "lazyRoute",
    );
    const bundle = Array.isArray(result) ? result[0]! : result;
    if (!("output" in bundle)) {
      throw new Error("Unexpected watch build");
    }
    const entry = bundle.output.find((chunk) => chunk.type === "chunk" && chunk.isEntry);
    if (entry?.type !== "chunk") {
      throw new Error("Missing browser entry");
    }
    expect(entry.code).not.toContain("LAZY_PAGE_ONLY_MARKER");
    expect(entry.code).not.toContain("generateRoutes");
    expect(entry.code).not.toContain("node:fs");
    const files = await readdir(join(fixture.root, "dist/assets"));
    const all = (
      await Promise.all(
        files
          .filter((file) => file.endsWith(".js"))
          .map((file) => readFile(join(fixture.root, "dist/assets", file), "utf8")),
      )
    ).join("\n");
    expect(all).toContain("LAZY_PAGE_ONLY_MARKER");
  } finally {
    await fixture.dispose();
  }
}, 30_000);
