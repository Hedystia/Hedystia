import fs from "fs/promises";
import Framework, { h } from "hedystia";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const typesFilePath = path.join(__dirname, "test-server.d.ts");

const app = new Framework()
  .get("/", () => "", { response: h.string() })
  .get("/users/get", () => ({ status: "ok" }), {
    response: h.object({ status: h.literal("ok") }),
  })
  .get("/slug/:name", (ctx) => ctx.params, {
    params: h.object({ name: h.string() }),
    response: h.object({ name: h.string() }),
  })
  .get("/test/test/new/random/:name/:id", (ctx) => ctx.params, {
    params: h.object({ id: h.number().coerce(), name: h.string() }),
    response: h.object({ id: h.number(), name: h.string() }),
  })
  .get("/headers", (ctx) => ctx.headers, {
    headers: h.object({ "x-test-header": h.string() }),
    response: h.object({ "x-test-header": h.string() }),
  });

describe("Build Process", () => {
  beforeAll(async () => {
    try {
      await fs.unlink(typesFilePath);
    } catch {}
  });

  afterAll(async () => {
    try {
      await fs.unlink(typesFilePath);
    } catch {}
  });

  it("should generate a type definition file with the correct minified content", async () => {
    await app.buildTypes(typesFilePath);
    const fileExists = await fs
      .access(typesFilePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);

    const generatedContent = await fs.readFile(typesFilePath, "utf-8");
    const expectedContent =
      '// Automatic Hedystia type generation\nexport type AppRoutes=[{method:"GET";path:"/";params:any;query:any;body:any;headers:any;response:string;data:any;error:any},{method:"GET";path:"/users/get";params:any;query:any;body:any;headers:any;response:{status:\'ok\'};data:any;error:any},{method:"GET";path:"/slug/:name";params:{name:string};query:any;body:any;headers:any;response:{name:string};data:any;error:any},{method:"GET";path:"/test/test/new/random/:name/:id";params:{id:number;name:string};query:any;body:any;headers:any;response:{id:number;name:string};data:any;error:any},{method:"GET";path:"/headers";params:any;query:any;body:any;headers:{"x-test-header":string};response:{"x-test-header":string};data:any;error:any}];';
    expect(generatedContent).toBe(expectedContent);
  });
});
