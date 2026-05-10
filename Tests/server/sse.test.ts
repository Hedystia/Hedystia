import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

let lifecycleEvents: string[] = [];

const app = new Framework({ sse: true })
  .onSubscriptionOpen((ctx) => {
    lifecycleEvents.push(`open:${ctx.path}:${ctx.subscriptionId}`);
  })
  .onSubscriptionClose((ctx) => {
    lifecycleEvents.push(`close:${ctx.path}:${ctx.subscriptionId}:${ctx.reason}`);
  })
  .subscription("/data/basic", async () => {
    return "Test";
  })
  .post("/data/basic", async () => {
    app.publish("/data/basic", { data: "New data" });
    return "Test";
  })
  .post(
    "/data/basic/body",
    async ({ body }) => {
      app.publish("/data/basic", { data: body.message });
      return "Test";
    },
    {
      body: h.object({
        message: h.string(),
      }),
    },
  )
  .subscription("/data/params/:id", async () => {
    return "test";
  })
  .post("/data/params/:id", async (ctx) => {
    app.publish(`/data/params/${ctx.params.id}`, ctx.params.id);
    return "Test";
  })
  .subscription(
    "/data/headers",
    async (ctx) => {
      return ctx.headers["x-test"];
    },
    {
      headers: h.object({
        "x-test": h.string(),
      }),
    },
  )
  .subscription(
    "/data/typed",
    async (ctx) => {
      const shouldError = ctx.query.error === "true";

      if (shouldError) {
        ctx.sendError({ message: "Test error", code: 400 });
        return;
      }

      ctx.sendData({ id: "123", message: "Success" });
    },
    {
      query: h.object({
        error: h.optional(h.string()),
      }),
      data: h.object({
        id: h.string(),
        message: h.string(),
      }),
      error: h.object({
        message: h.string(),
        code: h.number(),
      }),
    },
  )
  .subscription("/data/isactive", async (ctx) => {
    let count = 0;
    const interval = setInterval(() => {
      if (!ctx.isActive()) {
        clearInterval(interval);
        return;
      }
      count++;
      ctx.sendData({ count });
    }, 50);
    return { count: 0 };
  })
  .listen(3025);

const client = createClient<typeof app>("http://127.0.0.1:3025", { sse: true });

describe("Test SSE subscriptions", () => {
  let logs: string[] = [];

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("should receive initial data from SSE subscription", async () => {
    logs = [];
    const sub = client.data.basic.subscribe(({ data }) => {
      logs.push(`Data: ${JSON.stringify(data)}`);
    });

    await wait(200);
    sub.unsubscribe();

    expect(logs.length).toBeGreaterThan(0);
  });

  it("should handle subscription with data and error schemas", async () => {
    logs = [];

    const sub1 = client.data.typed.subscribe(
      ({ data, error }) => {
        if (data) {
          logs.push(`Data: ${data.id} - ${data.message}`);
        }
        if (error) {
          logs.push(`Error: ${error.message} (${error.code})`);
        }
      },
      { query: { error: "false" } },
    );

    await wait(200);
    sub1.unsubscribe();

    expect(logs).toContain("Data: 123 - Success");
  });

  it("should throw error when trying to send data in SSE mode", async () => {
    const sub = client.data.basic.subscribe(() => {});

    await wait(100);

    sub.send({ message: "test" });
    expect(true).toBe(true);

    sub.unsubscribe();
  });

  it("should trigger lifecycle events on subscribe/unsubscribe", async () => {
    lifecycleEvents = [];
    const sub = client.data.isactive.subscribe(({ data }) => {
      if (data) {
        logs.push(`count: ${data.count}`);
      }
    });

    await wait(100);
    sub.unsubscribe();
    await wait(100);

    expect(lifecycleEvents.some((e) => e.startsWith("open:/data/isactive:"))).toBe(true);
    expect(lifecycleEvents[0]).toMatch(/^open:\/data\/isactive:/);
  });

  afterAll(() => {
    app.close();
  });
});
