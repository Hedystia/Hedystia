import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTypesContent } from "@hedystia/types";
import { h } from "@hedystia/validations";
import Framework from "hedystia";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("compact route declarations", () => {
  it("preserves configured global request schemas instead of treating them as absent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hedystia-compact-globals-"));
    try {
      const app = new Framework({ headers: h.object({ "x-token": h.string() }) }).get(
        "/private",
        () => "ok",
      );
      const path = join(directory, "routes.d.ts");
      await app.buildTypes(path);
      expect(await readFile(path, "utf8")).toBe(
        '// Automatic Hedystia type generation\nexport type AppRoutes=[{method:"GET";path:"/private";headers:{"x-token":string}}];',
      );
      expect((await app.fetch(new Request("https://example.test/private"))).status).toBe(400);
      expect(
        (
          await app.fetch(
            new Request("https://example.test/private", { headers: { "x-token": "present" } }),
          )
        ).status,
      ).toBe(200);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("omits absent sections and keeps only the route identity", () => {
    expect(generateTypesContent([{ method: "GET", path: "/health" }])).toBe(
      '// Automatic Hedystia type generation\nexport type AppRoutes=[{method:"GET";path:"/health"}];',
    );
    expect(
      generateTypesContent([{ method: "GET", path: "/health", body: undefined, query: null }]),
    ).toBe(generateTypesContent([{ method: "GET", path: "/health" }]));
  });

  it("retains explicitly declared any, unknown, null, undefined, void and never schemas", () => {
    const content = generateTypesContent([
      {
        method: "POST",
        path: "/explicit",
        body: h.any(),
        query: h.unknown(),
        response: h.null(),
        data: h.undefined(),
        error: h.never(),
        message: h.void(),
      },
    ]);
    expect(content).toContain(
      'path:"/explicit";query:unknown;body:any;response:null;data:undefined;error:never;message:void',
    );
  });

  it("preserves optional schemas and unsupported defined schemas rather than mistaking them for absent sections", () => {
    expect(
      generateTypesContent([
        {
          method: "POST",
          path: "/optional",
          body: h.optional(h.string()),
          response: {},
        },
      ]),
    ).toContain('path:"/optional";body:string | undefined;response:any');
  });

  it("forwards declared subscription message schemas through the server build entry point", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hedystia-compact-server-"));
    try {
      const app = new Framework()
        .get("/plain", () => "ok")
        .get("/typed", () => "ok", { response: h.string(), error: h.object({ code: h.number() }) })
        .subscription("/feed", () => ({ count: 1 }), {
          data: h.object({ count: h.number() }),
          message: h.object({ topic: h.string() }),
        });
      const path = join(directory, "routes.d.ts");
      await app.buildTypes(path);
      expect(await readFile(path, "utf8")).toBe(
        '// Automatic Hedystia type generation\nexport type AppRoutes=[{method:"GET";path:"/plain"},{method:"GET";path:"/typed";response:string;error:{code:number}},{method:"SUB";path:"/feed";data:{count:number};message:{topic:string}}];',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("compiles actual generated declarations into a client with typed requests and safe missing-field defaults", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hedystia-compact-client-"));
    try {
      await mkdir(join(directory, "node_modules/@hedystia"), { recursive: true });
      await symlink(
        await realpath(fileURLToPath(new URL("../../Packages/client", import.meta.url))),
        join(directory, "node_modules/@hedystia/client"),
        "dir",
      );
      const declaration = generateTypesContent([
        { method: "GET", path: "/health", response: h.object({ ok: h.boolean() }) },
        { method: "GET", path: "/users/:id" },
        { method: "GET", path: "/mixed/:id", params: h.object({ id: h.number() }) },
        { method: "POST", path: "/mixed/:id" },
        { method: "GET", path: "/optional/:id", params: h.optional(h.object({ id: h.number() })) },
        {
          method: "POST",
          path: "/orders",
          body: h.object({ quantity: h.number() }),
          response: h.object({ id: h.string() }),
          error: h.object({ code: h.number() }),
        },
        { method: "POST", path: "/empty" },
        { method: "GET", path: "/search", query: h.object({ page: h.optional(h.number()) }) },
        { method: "GET", path: "/explicit", response: h.any() },
        {
          method: "SUB",
          path: "/feed",
          data: h.object({ count: h.number() }),
          message: h.object({ topic: h.string() }),
        },
        { method: "SUB", path: "/untyped" },
        { method: "WS", path: "/socket/:id" },
      ]);
      await writeFile(join(directory, "routes.d.ts"), declaration);
      const source = join(directory, "consumer.ts");
      await writeFile(
        source,
        `
import { createClient } from "@hedystia/client";
import type { AppRoutes } from "./routes";
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
const client = createClient<AppRoutes>("https://example.test");
const health = await client.health.get();
type Health = Expect<Equal<typeof health.data, { ok: boolean } | null>>;
type HealthOptions = NonNullable<Parameters<typeof client.health.get>[0]>;
type NoQuery = Expect<Equal<"query" extends keyof HealthOptions ? true : false, false>>;
type NoHeaders = Expect<Equal<"headers" extends keyof HealthOptions ? true : false, false>>;
type NoBody = Expect<Equal<"body" extends keyof NonNullable<Parameters<typeof client.empty.post>[0]> ? true : false, false>>;
await client.empty.post();
const untyped = await client.users.id("a/b").get();
await client.users.id(42).get();
await client.mixed.id(2).get();
await client.mixed.id(2).post();
type SharedPath = Expect<Equal<Parameters<typeof client.mixed.id>[0], number>>;
await client.optional.id(3).get();
type OptionalPath = Expect<Equal<Parameters<typeof client.optional.id>[0], number>>;
type UntypedResponse = Expect<Equal<typeof untyped.data, unknown>>;
type UntypedError = Expect<Equal<typeof untyped.error, unknown>>;
type TypedBody = Expect<Equal<Parameters<typeof client.orders.post>[0]["body"], { quantity: number }>>;
type RequiredBody = Expect<Equal<undefined extends Parameters<typeof client.orders.post>[0] ? true : false, false>>;
const order = await client.orders.post({ body: { quantity: 2 } });
type Order = Expect<Equal<typeof order.data, { id: string } | null>>;
type OrderError = Expect<Equal<typeof order.error, { code: number } | null>>;
await client.search.get();
await client.search.get({ query: { page: 2 } });
const explicit = await client.explicit.get();
type ExplicitAny = Expect<Equal<typeof explicit.data, any>>;
client.feed.subscribe(event => {
  type Data = Expect<Equal<typeof event.data, { count: number } | undefined>>;
  type Message = Expect<Equal<Parameters<typeof event.send>[0], { topic: string }>>;
  event.send({ topic: "updates" });
});
client.untyped.subscribe(event => {
  type UnknownData = Expect<Equal<typeof event.data, unknown>>;
  type UnknownMessage = Expect<Equal<Parameters<typeof event.send>[0], unknown>>;
  event.send("anything");
});
client.socket.id("native").ws(ws => ws.send("hello"));
type LegacyRoutes = [{method:"GET";path:"/legacy";params:any;query:any;body:any;headers:any;response:any;data:any;error:any;message:any}];
const legacy = createClient<LegacyRoutes>("https://example.test");
const legacyResult = await legacy.legacy.get({ query: { allowed: true } });
type LegacyData = Expect<Equal<typeof legacyResult.data, any>>;
`,
      );
      const program = ts.createProgram([source], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      expect(
        diagnostics.map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
      ).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
