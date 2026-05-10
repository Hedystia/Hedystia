import { adapter } from "@hedystia/adapter";
import { createClient } from "@hedystia/client";
import express from "express";
import Hedystia, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const subApp = new Hedystia().get("/world", () => ({ message: "Hello from sub-app!" }), {
  response: h.object({ message: h.string() }),
});

const app = new Hedystia()
  .onRequest((req) => {
    req.headers.set("x-global-hook", "onRequest-OK");
    return req;
  })
  .onBeforeHandle(async (ctx: any, next) => {
    ctx.sharedValue = "set-by-before-handle";
    return next();
  })
  .onError((err, ctx) => {
    ctx.set.status(500);
    return { customError: `Error handled: ${err.message}` };
  })
  .get("/", () => "Welcome!", { response: h.string() })
  .get("/users/get", () => ({ status: "ok" }), {
    response: h.object({ status: h.literal("ok") }),
  })
  .get("/slug/:name", (ctx) => ctx.params, {
    params: h.object({ name: h.string() }),
    response: h.object({ name: h.string() }),
  })
  .get(
    "/headers-test",
    (ctx) => {
      return {
        "x-test-header": ctx.headers["x-test-header"],
        "x-global-hook": ctx.req.headers.get("x-global-hook"),
      };
    },
    {
      headers: h.object({ "x-test-header": h.string() }),
      response: h.object({
        "x-test-header": h.string(),
        "x-global-hook": h.string(),
        host: h.string(),
        "accept-encoding": h.string(),
        connection: h.string(),
        "user-agent": h.string(),
        "content-type": h.string().optional(),
        "content-length": h.string().optional(),
      }),
    },
  )
  .post("/users", ({ body }) => ({ body }), {
    body: h.object({ name: h.string() }),
    response: h.object({ body: h.object({ name: h.string() }) }),
  })
  .post("/users/:id", ({ params, body }) => ({ params, body }), {
    params: h.object({ id: h.number().coerce() }),
    body: h.object({ name: h.string() }),
    response: h.object({
      params: h.object({ id: h.number() }),
      body: h.object({ name: h.string() }),
    }),
  })
  .put("/item/:id", ({ params, body }) => ({ id: params.id, ...body }), {
    params: h.object({ id: h.string() }),
    body: h.object({ value: h.string() }),
    response: h.object({ id: h.string(), value: h.string() }),
  })
  .get("/before-handle-test", (ctx: any) => ({ value: ctx.sharedValue }), {
    response: h.object({ value: h.string() }),
  })
  .get("/error-test", () => {
    throw new Error("Something went wrong");
  })
  .group("/products", (group) =>
    group
      .get("/", () => [{ id: 1, name: "Laptop" }], {
        response: h.array(h.object({ id: h.number(), name: h.string() })),
      })
      .get("/:id", (ctx) => ({ id: ctx.params.id, name: `Product ${ctx.params.id}` }), {
        params: h.object({ id: h.number().coerce() }),
        response: h.object({ id: h.number(), name: h.string() }),
      }),
  )
  .use("/v2", subApp);

const expressApp = express();
const PORT = 3023;

expressApp.use(express.json());

expressApp.use(adapter(app).toNodeHandler());

const server = expressApp.listen(PORT, () => {
  console.log(`Express server with Hedystia adapter listening on port ${PORT}`);
});

const client = createClient<typeof app>(`http://127.0.0.1:${PORT}`);

describe("Express Adapter Comprehensive Tests", () => {
  it("should handle GET requests", async () => {
    const { data, error } = await client.get();
    expect(error).toBeNull();
    expect(data).toBe("Welcome!");
  });

  it("should handle GET requests with URL params", async () => {
    const { data } = await client.slug.name("testing").get();
    expect(data).toEqual({ name: "testing" });
  });

  it("should handle POST requests with a body", async () => {
    const { data } = await client.users.post({
      body: { name: "John Doe" },
    });
    expect(data?.body).toEqual({ name: "John Doe" });
  });

  it("should handle POST requests with URL params and body", async () => {
    const { data } = await client.users.id(123).post({ body: { name: "Jane Doe" } });
    expect(data).toEqual({
      params: { id: 123 },
      body: { name: "Jane Doe" },
    });
  });

  it("should handle PUT requests", async () => {
    const { data } = await client.item.id("abc").put({ body: { value: "test-value" } });
    expect(data).toEqual({ id: "abc", value: "test-value" });
  });

  it("should handle grouped routes correctly", async () => {
    const { data: allProducts } = await client.products.get({});
    expect(allProducts?.[0]).toEqual({ id: 1, name: "Laptop" });

    const { data: singleProduct } = await client.products.id(123).get();
    expect(singleProduct).toEqual({ id: 123, name: "Product 123" });
  });

  it("should handle routes from a sub-app via .use()", async () => {
    const { data } = await client.v2.world.get();
    expect(data?.message).toBe("Hello from sub-app!");
  });

  describe("Lifecycle Hooks", () => {
    it("should trigger onRequest and pass modified headers", async () => {
      const { data } = await client["headers-test"].get({
        headers: { "x-test-header": "my-value" },
      });
      expect(data?.["x-test-header"]).toBe("my-value");
      expect(data?.["x-global-hook"]).toBe("onRequest-OK");
    });

    it("should trigger onBeforeHandle and modify context", async () => {
      const { data } = await client["before-handle-test"].get();
      expect(data?.value).toBe("set-by-before-handle");
    });

    it("should handle errors with a custom onError hook", async () => {
      const { error, status } = await client["error-test"].get();
      expect(status).toBe(500);
      expect(error?.customError).toBe("Error handled: Something went wrong");
    });
  });

  afterAll(() => {
    server.close();
  });
});
