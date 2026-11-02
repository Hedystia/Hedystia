import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const paramsApp = new Framework({
  params: h.object({ version: h.string() }),
})
  .get("/params/:version", (ctx) => ctx.params)
  .get("/noversion", () => ({ ok: true }))
  .listen(3050);

const queryApp = new Framework({
  query: h.object({ lang: h.string() }),
})
  .get("/query", (ctx) => ctx.query)
  .listen(3051);

const headersApp = new Framework({
  headers: h.object({ "x-global-auth": h.string() }),
})
  .get("/headers", (ctx) => ctx.headers, {
    headers: h.object({ "x-extra": h.string().optional() }).optional(),
  })
  .listen(3052);

const bodyApp = new Framework({
  body: h.object({ tenant: h.string() }),
})
  .post("/body", (ctx) => ctx.body, {
    body: h.object({ tenant: h.string(), name: h.string() }),
  })
  .listen(3053);

const groupedApp = new Framework({
  query: h.object({ lang: h.string() }),
}).group("/sub", (app) =>
  app.get("/grouped/:version", (ctx) => ({
    params: ctx.params,
    query: ctx.query,
  })),
);

const childApp = new Framework({
  params: h.object({ id: h.string() }),
}).get("/users/:id", (ctx) => ({
  params: ctx.params,
  query: ctx.query,
}));

const useApp = new Framework({
  query: h.object({ lang: h.string() }),
})
  .use("/api", childApp)
  .get("/plain", (ctx) => ctx.query)
  .listen(3054);

const ifApp = new Framework({
  query: h.object({ lang: h.string() }),
})
  .if((app) =>
    app.get("/conditional", (ctx) => ({
      enabled: true,
      query: ctx.query,
    })),
  )
  .listen(3055);

const mountedGroupApp = groupedApp.listen(3056);

afterAll(() => {
  paramsApp.close();
  queryApp.close();
  headersApp.close();
  bodyApp.close();
  mountedGroupApp.close();
  useApp.close();
  ifApp.close();
});

describe("Global request data", () => {
  it("should validate and inject global params", async () => {
    const client = createClient<typeof paramsApp>("http://127.0.0.1:3050");

    const { data, error } = await client.params.version("1").get();

    expect(error).toBeNull();
    expect(data?.version).toBe("1");
  });

  it("should reject requests with invalid global params", async () => {
    const client = createClient<typeof paramsApp>("http://127.0.0.1:3050");

    const { error, status } = await client.noversion.get();

    expect(status).toBe(400);
    expect(error).toBeTruthy();
  });

  it("should validate and inject global query", async () => {
    const client = createClient<typeof queryApp>("http://127.0.0.1:3051");

    const { data, error } = await client.query.get({
      query: { lang: "en" },
    });

    expect(error).toBeNull();
    expect(data?.lang).toBe("en");
  });

  it("should reject requests missing global query", async () => {
    const client = createClient<typeof queryApp>("http://127.0.0.1:3051");

    const { error, status } = await client.query.get();

    expect(status).toBe(400);
    expect(error).toBeTruthy();
  });

  it("should validate and inject global headers", async () => {
    const client = createClient<typeof headersApp>("http://127.0.0.1:3052");

    const { data, error } = await client.headers.get({
      headers: { "x-global-auth": "secret" },
    });

    expect(error).toBeNull();
    expect(data?.["x-global-auth"]).toBe("secret");
  });

  it("should reject requests missing global headers", async () => {
    const client = createClient<typeof headersApp>("http://127.0.0.1:3052");

    const { error, status } = await client.headers.get();

    expect(status).toBe(400);
    expect(error).toBeTruthy();
  });

  it("should validate and inject global body before route body schema", async () => {
    const client = createClient<typeof bodyApp>("http://127.0.0.1:3053");

    const { data, error } = await client.body.post({
      body: { tenant: "acme", name: "app" },
    });

    expect(error).toBeNull();
    expect(data?.tenant).toBe("acme");
    expect(data?.name).toBe("app");
  });

  it("should reject invalid global body", async () => {
    const client = createClient<typeof bodyApp>("http://127.0.0.1:3053");

    const { error, status } = await client.body.post({
      body: { name: "app" },
    });

    expect(status).toBe(400);
    expect(error).toBeTruthy();
  });

  it("should propagate globals into grouped routes", async () => {
    const client = createClient<typeof mountedGroupApp>("http://127.0.0.1:3056");

    const { data, error } = await client.sub.grouped.version("9").get({
      query: { lang: "en" },
    });

    expect(error).toBeNull();
    expect(data?.params.version).toBe("9");
    expect(data?.query.lang).toBe("en");
  });

  it("should propagate parent query globals into child routes mounted with use", async () => {
    const client = createClient<typeof useApp>("http://127.0.0.1:3054");

    const { data, error } = await client.api.users.id("5").get({
      query: { lang: "en" },
    });

    expect(error).toBeNull();
    expect(data?.params.id).toBe("5");
    expect(data?.query.lang).toBe("en");
  });

  it("should keep global query validation for schema-less routes after use", async () => {
    const client = createClient<typeof useApp>("http://127.0.0.1:3054");

    const { data, error } = await client.plain.get({
      query: { lang: "en" },
    });

    expect(error).toBeNull();
    expect(data?.lang).toBe("en");

    const { error: invalidError, status } = await client.plain.get();

    expect(status).toBe(400);
    expect(invalidError).toBeTruthy();
  });

  it("should propagate globals into conditionally registered routes", async () => {
    const client = createClient<typeof ifApp>("http://127.0.0.1:3055");

    const { data, error } = await client.conditional.get({
      query: { lang: "en" },
    });

    expect(error).toBeNull();
    expect(data?.enabled).toBe(true);
    expect(data?.query.lang).toBe("en");
  });
});
