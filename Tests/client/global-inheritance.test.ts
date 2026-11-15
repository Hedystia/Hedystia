import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { describe, expect, expectTypeOf, it } from "vitest";

/** Create two nested groups under an application with scoped request schemas. */
function scopedApp() {
  return new Framework({
    headers: h.object({ "x-token": h.string() }),
    body: h.object({ tenant: h.string() }),
  }).group("/v1", (group) =>
    group.group("/nested", (nested) =>
      nested
        .get("/info", ({ headers }) => ({ token: headers["x-token"] }), {
          response: h.object({ token: h.string() }),
        })
        .post(
          "/items/:id",
          ({ headers, body, params }) => ({
            token: headers["x-token"],
            tenant: body.tenant,
            id: params.id,
          }),
          {
            params: h.object({ id: h.number().coerce() }),
            response: h.object({ token: h.string(), tenant: h.string(), id: h.number() }),
          },
        ),
    ),
  );
}

/** Mount the scoped group without applying its globals to unrelated routes. */
function mainApp() {
  return new Framework()
    .get("/outside", () => ({ ok: true }), { response: h.object({ ok: h.boolean() }) })
    .use("/api", scopedApp());
}

describe("nested global client contracts", () => {
  it("preserves subscription data and message metadata when prefixing route types", () => {
    const app = new Framework().group("/events", (group) =>
      group.subscription("/feed", () => ({ count: 1 }), {
        data: h.object({ count: h.number() }),
        message: h.object({ topic: h.string() }),
      }),
    );
    const client = createClient<typeof app>("https://example.test");
    type Callback = Parameters<typeof client.events.feed.subscribe>[0];
    type Event = Parameters<Callback>[0];
    expectTypeOf<Event["data"]>().toEqualTypeOf<{ count: number } | undefined>();
    expectTypeOf<Parameters<Event["send"]>[0]>().toEqualTypeOf<{ topic: string }>();
  });

  it("preserves existing schema-free handler and client behavior outside global scopes", async () => {
    const app = new Framework()
      .get("/search/:id", ({ params, query }) => ({ id: params.id, query: query.q }))
      .post("/echo", ({ body }) => body);
    const client = createClient<typeof app>("https://example.test", {
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    });
    type Options = NonNullable<Parameters<typeof client.echo.post>[0]>;
    expectTypeOf<{ body: { ok: boolean } }>().toExtend<Options>();
    expect(await client.echo.post({ body: { ok: true } })).toMatchObject({
      status: 200,
      data: { ok: true },
    });
    expect(await client.search.id("sample").get({ query: { q: "hello" } })).toMatchObject({
      status: 200,
      data: { id: "sample", query: "hello" },
    });
  });

  it("preserves literal paths, required global headers and bodies and local params", async () => {
    const app = mainApp();
    const client = createClient<typeof app>("https://example.test", {
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    });
    expectTypeOf<(typeof app.allRoutes)[number]["path"]>().toEqualTypeOf<
      "/outside" | "/api/v1/nested/info" | "/api/v1/nested/items/:id"
    >();
    const item = client.api.v1.nested.items.id;
    expectTypeOf<Parameters<typeof item>[0]>().toEqualTypeOf<number>();
    const post = item(7).post;
    type Options = Parameters<typeof post>[0];
    type InfoOptions = Parameters<typeof client.api.v1.nested.info.get>[0];
    expectTypeOf<"body">().not.toExtend<keyof InfoOptions>();
    expectTypeOf<Options["headers"]>().toEqualTypeOf<{ "x-token": string }>();
    expectTypeOf<Options["body"]>().toEqualTypeOf<{ tenant: string }>();
    expectTypeOf<undefined>().not.toExtend<Options>();
    expectTypeOf<{ body: { tenant: string } }>().not.toExtend<Options>();
    expectTypeOf<{ headers: { "x-token": string } }>().not.toExtend<Options>();
    expectTypeOf<{
      headers: { "x-token": number };
      body: { tenant: string };
    }>().not.toExtend<Options>();
    expectTypeOf<{
      headers: { "x-token": string };
      body: { tenant: number };
    }>().not.toExtend<Options>();
    const result = await post({ headers: { "x-token": "valid" }, body: { tenant: "acme" } });
    expectTypeOf(result.data).toEqualTypeOf<{ token: string; tenant: string; id: number } | null>();
    expect(result).toMatchObject({ status: 200, data: { token: "valid", tenant: "acme", id: 7 } });
    expect(await client.api.v1.nested.info.get({ headers: { "x-token": "valid" } })).toMatchObject({
      status: 200,
      data: { token: "valid" },
    });
    expect(await client.outside.get()).toMatchObject({ status: 200, data: { ok: true } });
  });

  it("supports direct scoped clients and mounting without a prefix", async () => {
    const scoped = scopedApp();
    const direct = createClient<typeof scoped>("https://example.test", {
      fetch: (input, init) => Promise.resolve(scoped.fetch(new Request(input, init))),
    });
    expectTypeOf<Parameters<typeof direct.v1.nested.items.id>[0]>().toEqualTypeOf<number>();
    expect(
      await direct.v1.nested.items
        .id(2)
        .post({ headers: { "x-token": "valid" }, body: { tenant: "acme" } }),
    ).toMatchObject({ status: 200 });
    const mounted = new Framework().use(scoped);
    const client = createClient<typeof mounted>("https://example.test", {
      fetch: (input, init) => Promise.resolve(mounted.fetch(new Request(input, init))),
    });
    expectTypeOf<(typeof mounted.allRoutes)[number]["path"]>().toEqualTypeOf<
      "/v1/nested/info" | "/v1/nested/items/:id"
    >();
    expect(
      await client.v1.nested.items
        .id(3)
        .post({ headers: { "x-token": "valid" }, body: { tenant: "acme" } }),
    ).toMatchObject({ status: 200 });
  });

  it("propagates parent globals into a separately constructed mounted child", async () => {
    const app = new Framework({
      headers: h.object({ "x-parent": h.string() }),
      body: h.object({ tenant: h.string() }),
    }).use(
      "/mounted",
      new Framework().group("/deep", (child) =>
        child.post("/items", () => "ok", { response: h.string() }),
      ),
    );
    const client = createClient<typeof app>("https://example.test", {
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    });
    const post = client.mounted.deep.items.post;
    type Options = Parameters<typeof post>[0];
    expectTypeOf<Options["headers"]["x-parent"]>().toEqualTypeOf<string>();
    expectTypeOf<Options["body"]>().toEqualTypeOf<{ tenant: string }>();
    expectTypeOf<undefined>().not.toExtend<Options>();
    expect(
      await post({ headers: { "x-parent": "valid" }, body: { tenant: "acme" } }),
    ).toMatchObject({ status: 200, data: "ok" });
  });

  it("keeps global request schemas on every body-bearing HTTP method", async () => {
    const app = new Framework({
      headers: h.object({ "x-token": h.string() }),
      body: h.object({ tenant: h.string() }),
    })
      .post("/items", ({ body }) => body.tenant, { response: h.string() })
      .put("/items", ({ body }) => body.tenant, { response: h.string() })
      .patch("/items", ({ body }) => body.tenant, { response: h.string() })
      .delete("/items", ({ body }) => body.tenant, { response: h.string() });
    const client = createClient<typeof app>("https://example.test", {
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    });
    for (const method of [
      client.items.post,
      client.items.put,
      client.items.patch,
      client.items.delete,
    ]) {
      type Options = Parameters<typeof method>[0];
      expectTypeOf<Options["headers"]>().toEqualTypeOf<{ "x-token": string }>();
      expectTypeOf<Options["body"]>().toEqualTypeOf<{ tenant: string }>();
      expectTypeOf<undefined>().not.toExtend<Options>();
      expect(
        await method({ headers: { "x-token": "valid" }, body: { tenant: "acme" } }),
      ).toMatchObject({ status: 200, data: "acme" });
    }
  });

  it.each([
    { headers: {}, body: { tenant: "acme" } },
    { headers: { "x-token": "valid" }, body: {} },
    { headers: { "x-token": "valid" }, body: { tenant: 42 } },
  ])("continues validating inherited schemas at runtime for %j", async ({ headers, body }) => {
    const app = mainApp();
    const requestHeaders = new Headers({ "content-type": "application/json" });
    for (const [name, value] of Object.entries(headers)) {
      if (value !== undefined) {
        requestHeaders.set(name, value);
      }
    }
    const response = await app.fetch(
      new Request("https://example.test/api/v1/nested/items/7", {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("keeps inherited schemas in generated nested route declarations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hedystia-nested-globals-"));
    try {
      const path = join(directory, "routes.d.ts");
      await mainApp().buildTypes(path);
      const content = await readFile(path, "utf8");
      expect(content).toContain(
        'path:"/api/v1/nested/items/:id";params:{id:number};body:{tenant:string};headers:{"x-token":string}',
      );
      expect(content).toContain('path:"/api/v1/nested/info";headers:{"x-token":string}');
      expect(content).toContain('path:"/outside";response:{ok:boolean}');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
