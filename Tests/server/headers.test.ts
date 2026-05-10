import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .get(
    "/headers",
    (context) => {
      return context.headers;
    },
    {
      headers: h
        .object({
          "x-test-header": h.string().optional(),
        })
        .optional(),
      response: h.object({ "x-test-header": h.string() }),
    },
  )
  .get(
    "/multi-headers",
    (context) => {
      return context.headers;
    },
    {
      headers: h
        .object({
          "x-global-header": h.string().optional(),
          "x-override-header": h.string().optional(),
        })
        .optional(),
      response: h.object({
        "x-global-header": h.string(),
        "x-override-header": h.string(),
      }),
    },
  )
  .get("/raw-headers", (ctx) => {
    return {
      headers: ctx.headers,
      rawHeaders: ctx.rawHeaders,
    };
  })
  .listen(3001);

describe("Headers and rawHeaders", () => {
  it("should provide rawHeaders with all headers unfiltered", async () => {
    const client = createClient<typeof app>("http://127.0.0.1:3001");

    const { data, error } = await client["raw-headers"].get({
      headers: {
        "x-custom-unfiltered": "unfiltered-value",
        "user-agent": "test-agent",
      },
    });

    expect(error).toBeNull();
    expect(data.rawHeaders["x-custom-unfiltered"]).toBe("unfiltered-value");
    expect(data.rawHeaders["user-agent"]).toBe("test-agent");
  });

  it("should handle global headers from constructor", async () => {
    const globalApp = new Framework({
      headers: h.object({
        "x-global-auth": h.string(),
      }),
    })
      .get("/test", (ctx) => ctx.headers)
      .listen(3024);

    const client = createClient<typeof globalApp>("http://127.0.0.1:3024");

    const { data, error } = await client.test.get({
      headers: {
        "x-global-auth": "secret-token",
        "some-other": "ignored-in-validated",
      },
    });

    expect(error).toBeNull();
    expect(data["x-global-auth"]).toBe("secret-token");
    globalApp.close();
  });

  it("should merge global and route-level headers", async () => {
    const mergeApp = new Framework({
      headers: h.object({
        "x-global": h.string(),
      }),
    })
      .get("/merge", (ctx) => ctx.headers, {
        headers: h.object({
          "x-route": h.string(),
        }),
      })
      .listen(3026);

    const client = createClient<typeof mergeApp>("http://127.0.0.1:3026");

    const { data, error } = await client.merge.get({
      headers: {
        "x-global": "val1",
        "x-route": "val2",
        "x-extra": "val3",
      } as any,
    });

    expect(error).toBeNull();
    expect(data["x-global"]).toBe("val1");
    expect(data["x-route"]).toBe("val2");

    mergeApp.close();
  });
});

describe("Global headers in createClient", () => {
  it("should send global headers on every request", async () => {
    const client = createClient<typeof app>("http://127.0.0.1:3001", {
      headers: {
        "x-test-header": "global-value",
      },
    });

    const { data, error } = await client.headers.get();

    expect(error).toBeNull();
    expect(data).toMatchObject({ "x-test-header": "global-value" });
  });

  it("should allow per-request headers to override global headers", async () => {
    const client = createClient<typeof app>("http://127.0.0.1:3001", {
      headers: {
        "x-test-header": "global-value",
      },
    });

    const { data, error } = await client.headers.get({
      headers: {
        "x-test-header": "overridden-value",
      },
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ "x-test-header": "overridden-value" });
  });

  it("should merge global and per-request headers", async () => {
    const client = createClient<typeof app>("http://127.0.0.1:3001", {
      headers: {
        "x-global-header": "global-value",
        "x-override-header": "global-override",
      },
    });

    const { data, error } = await client["multi-headers"].get({
      headers: {
        "x-override-header": "local-override",
      },
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ "x-global-header": "global-value" });
    expect(data).toMatchObject({ "x-override-header": "local-override" });
  });

  it("should work without global headers (backwards compatible)", async () => {
    const client = createClient<typeof app>("http://127.0.0.1:3001");

    const { data, error } = await client.headers.get({
      headers: {
        "x-test-header": "no-global",
      },
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ "x-test-header": "no-global" });
  });

  afterAll(() => {
    app.close();
  });
});
