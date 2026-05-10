import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const ENABLE_FEATURE = true;
const DISABLE_FEATURE = false;

const app = new Framework()
  .get("/always", () => ({ available: true }), {
    response: h.object({ available: h.boolean() }),
  })
  .if((app) => {
    if (ENABLE_FEATURE) {
      return app.get("/enabled", () => ({ enabled: true }), {
        response: h.object({ enabled: h.boolean() }),
      });
    }
  })
  .if((app) => {
    if (DISABLE_FEATURE) {
      return app.get("/disabled", () => ({ disabled: true }), {
        response: h.object({ disabled: h.boolean() }),
      });
    }
  })
  .if((app) => {
    if (ENABLE_FEATURE) {
      return app.post("/conditional-post", ({ body }) => ({ received: body.name }), {
        body: h.object({ name: h.string() }),
        response: h.object({ received: h.string() }),
      });
    }
  })
  .listen(3038);

const client = createClient<typeof app>("http://127.0.0.1:3038");

describe("Conditional Route Registration (.if())", () => {
  it("should always register non-conditional routes", async () => {
    const { data, error } = await client.always.get();
    expect(error).toBeNull();
    expect(data).toEqual({ available: true });
  });

  it("should register routes when condition is true", async () => {
    const { data, error } = await client.enabled.get();
    expect(error).toBeNull();
    expect(data).toEqual({ enabled: true });
  });

  it("should not register routes when condition is false", async () => {
    const response = await fetch("http://127.0.0.1:3038/disabled");
    expect(response.status).toBe(404);
  });

  it("should support conditional POST routes", async () => {
    const { data, error } = await client["conditional-post"].post({
      body: { name: "test" },
    });
    expect(error).toBeNull();
    expect(data).toEqual({ received: "test" });
  });

  it("should support method chaining after .if()", async () => {
    const app2 = new Framework()
      .if((app) => {
        return app.get("/first", () => ({ first: true }), {
          response: h.object({ first: h.boolean() }),
        });
      })
      .get("/second", () => ({ second: true }), {
        response: h.object({ second: h.boolean() }),
      })
      .listen(3039);

    const client2 = createClient<typeof app2>("http://127.0.0.1:3039");

    const { data: data1, error: error1 } = await client2.first.get();
    expect(error1).toBeNull();
    expect(data1).toEqual({ first: true });

    const { data: data2, error: error2 } = await client2.second.get();
    expect(error2).toBeNull();
    expect(data2).toEqual({ second: true });

    app2.close();
  });

  afterAll(() => {
    app.close();
  });
});
