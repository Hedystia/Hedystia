import { readFile } from "node:fs/promises";
import { generateRoutes } from "@hedystia/router/vite";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { project } from "../helpers/project";

/** Compile emitted route declarations using the same public types a consumer receives. */
function diagnostics(file: string): readonly ts.Diagnostic[] {
  const program = ts.createProgram([file], {
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  });
  return ts.getPreEmitDiagnostics(program);
}

describe("lazy file-route generation", () => {
  it("generates deterministic typed imports, layouts, indexes and dynamic routes", async () => {
    const fixture = await project("routes");
    try {
      await fixture.write(
        "src/routes/__root.ts",
        'import {createLayout} from "@hedystia/router"; export const Route=createLayout("root");',
      );
      await fixture.write(
        "src/routes/index.ts",
        'import {createRoute} from "@hedystia/router"; export const Route=createRoute("/");',
      );
      await fixture.write(
        "src/routes/users.ts",
        'import {createRoute} from "@hedystia/router"; export const Route=createRoute("/users");',
      );
      await fixture.write(
        "src/routes/users/index.ts",
        'import {createRoute} from "@hedystia/router"; export const Route=createRoute("/users/");',
      );
      await fixture.write(
        "src/routes/users/$id.ts",
        'import {createRoute} from "@hedystia/router"; export const Route=createRoute("/users/$id", {loader:({params})=>({id:params.id})});',
      );
      const result = await generateRoutes({ root: fixture.root });
      expect(result.paths).toEqual(["/", "/users", "/users/", "/users/$id"]);
      const source = await readFile(result.file, "utf8");
      expect(source).toContain("() => import(");
      expect(source).toContain("addChildren");
      expect((await generateRoutes({ root: fixture.root })).changed).toBe(false);
      const valid = await fixture.write(
        "src/contracts.ts",
        'import {createRouter} from "@hedystia/router"; import {routeTree} from "./routeTree.gen"; const router=createRouter({routes:routeTree}); router.navigate({to:"/users/$id",params:{id:1}}); const data:{id:string}|undefined=router.match("/users/$id")?.data;',
      );
      expect(
        diagnostics(valid).map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
      ).toEqual([]);
      const invalid = await fixture.write(
        "src/invalid.ts",
        'import {createRouter} from "@hedystia/router"; import {routeTree} from "./routeTree.gen"; const router=createRouter({routes:routeTree}); router.navigate({to:"/missing"}); router.navigate({to:"/users/$id"}); router.navigate({to:"/users/$id",params:{wrong:"x"}});',
      );
      expect(
        diagnostics(invalid).filter((diagnostic) => diagnostic.file?.fileName === invalid),
      ).toHaveLength(3);
    } finally {
      await fixture.dispose();
    }
  }, 30_000);

  it("rejects duplicate file routes and detects source/path mismatches at compilation", async () => {
    const fixture = await project("route-mismatch");
    try {
      await fixture.write(
        "src/routes/user.ts",
        'import {createRoute} from "@hedystia/router"; export const Route=createRoute("/wrong");',
      );
      const generated = await generateRoutes({ root: fixture.root });
      expect(diagnostics(generated.file).length).toBeGreaterThan(0);
      await fixture.write("src/routes/user.tsx", "export const Route={};");
      await expect(generateRoutes({ root: fixture.root })).rejects.toThrow("Duplicate");
    } finally {
      await fixture.dispose();
    }
  }, 30_000);
});
