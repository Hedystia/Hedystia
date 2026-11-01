import Framework from "hedystia";
import { describe, expect, it } from "vitest";

const app = new Framework({ cors: false })
  .get("/", () => "Hi")
  .post("/json", ({ body }) => body)
  .post("/raw", ({ body, rawBody }) => ({ body, rawBody }), {
    body: {} as never,
  })
  .get("/id/:id", (ctx) => {
    ctx.set.headers.set("x-powered-by", "benchmark");
    const { id } = ctx.params as { id: string };
    const { name } = ctx.query as { name?: string };
    return `${id} ${name ?? ""}`;
  })
  .get("/inspect", (ctx) => ({
    headers: ctx.headers,
    query: ctx.query,
    params: ctx.params,
  }));

describe("Benchmark route contract", () => {
  it("returns text for the ping route", async () => {
    const response = await app.fetch(new Request("http://localhost/"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Hi");
    expect(response.headers.get("Content-Type")?.includes("text/plain")).toBe(true);
  });

  it("extracts query values dynamically", async () => {
    const named = await app.fetch(new Request("http://localhost/id/1?name=bun"));
    expect(await named.text()).toBe("1 bun");
    expect(named.headers.get("x-powered-by")).toBe("benchmark");

    const duplicated = await app.fetch(new Request("http://localhost/id/1?name=bun&id=1"));
    expect(await duplicated.text()).toBe("1 bun");

    const missing = await app.fetch(new Request("http://localhost/id/1?id=1"));
    expect(await missing.text()).toBe("1 ");
  });

  it("mirrors a JSON body through parse and serialize", async () => {
    const response = await app.fetch(
      new Request("http://localhost/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hello: "world" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(JSON.stringify({ hello: "world" }));
    expect(response.headers.get("Content-Type")?.includes("application/json")).toBe(true);
  });

  it("exposes the raw body alongside the parsed body", async () => {
    const response = await app.fetch(
      new Request("http://localhost/raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"hello":"world"}',
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.body).toEqual({ hello: "world" });
    expect(payload.rawBody).toBeDefined();
  });

  it("passes headers, query, and params through without schemas", async () => {
    const response = await app.fetch(
      new Request("http://localhost/inspect?a=1&b=2", {
        headers: { "x-custom": "yes" },
      }),
    );
    const payload = await response.json();
    expect(payload.headers["x-custom"]).toBe("yes");
    expect(payload.query).toEqual({ a: "1", b: "2" });
    expect(payload.params).toEqual({});
  });
});

