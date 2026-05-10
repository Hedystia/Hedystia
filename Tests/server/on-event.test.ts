import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { describe, expect, it } from "vitest";

describe("Framework .on() Hooks Tests", () => {
  it("should trigger onRequest hook", async () => {
    const app = new Framework()
      .onRequest((req) => {
        req.headers.set("X-Test-Header", "modified");
        return req;
      })
      .get("/test-header", (ctx) => {
        return {
          headerValue: ctx.req.headers.get("X-Test-Header"),
        };
      });
    app.listen(0);
    while (!app.server?.port) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const client = createClient<typeof app>(`http://127.0.0.1:${app.server!.port}`);
    const { data } = await client["test-header"].get();

    expect(data?.headerValue).toBe("modified");

    app.close();
  });

  it("should trigger onParse hook", async () => {
    const app = new Framework()
      .onParse(() => {
        return { custom: true };
      })
      .post(
        "/parse-test",
        (ctx) => {
          return { parsedBody: ctx.body };
        },
        {
          body: h.any(),
        },
      );
    app.listen(0);
    while (!app.server?.port) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const client = createClient<typeof app>(`http://127.0.0.1:${app.server!.port}`);
    const { data } = await client["parse-test"].post({
      body: "raw text",
    });

    expect(data?.parsedBody).toEqual({ custom: true });

    app.close();
  });

  it("should trigger onTransform hook", async () => {
    const app = new Framework()
      .onTransform((ctx) => ({
        ...ctx,
        transformed: true,
      }))
      .get("/transform-test", (ctx: any) => {
        return { wasTransformed: ctx.transformed };
      });
    app.listen(0);
    while (!app.server?.port) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const client = createClient<typeof app>(`http://127.0.0.1:${app.server!.port}`);
    const { data } = await client["transform-test"].get();

    expect(data?.wasTransformed).toBe(true);

    app.close();
  });

  it("should chain multiple onBeforeHandle hooks", async () => {
    const app = new Framework()
      .onBeforeHandle(async (ctx: any, next) => {
        ctx.modified = "first";
        return next();
      })
      .onBeforeHandle(async (ctx: any, next) => {
        ctx.modified += "-second";
        return next();
      })
      .get("/before-handle", (ctx: any) => {
        return { chainResult: ctx.modified };
      });
    app.listen(0);
    while (!app.server?.port) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const client = createClient<typeof app>(`http://127.0.0.1:${app.server!.port}`);
    const { data } = (await client["before-handle"].get()) as any;

    expect(data?.chainResult).toBe("first-second");

    app.close();
  });

  it("should trigger onAfterHandle hook", async () => {
    const app = new Framework()
      .onAfterHandle(async (_res, ctx) => {
        ctx.set.headers.set("X-Modified", "true");
      })
      .get("/after-handle", () => ({ original: true }));
    app.listen(0);
    while (!app.server?.port) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const response = await fetch(`http://127.0.0.1:${app.server!.port}/after-handle`);

    expect(response.headers.get("X-Modified")).toBe("true");
    expect(await response.json()).toEqual({ original: true });

    app.close();
  });

  it("should handle errors with onError hook", async () => {
    const app = new Framework()
      .onError((err) => {
        return { customError: `${err.message} handled` };
      })
      .get("/error-test", () => {
        throw new Error("Test error");
      });
    app.listen(0);
    while (!app.server?.port) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const client = createClient<typeof app>(`http://127.0.0.1:${app.server!.port}`);
    const { data } = await client["error-test"].get();

    expect(data?.customError).toBe("Test error handled");

    app.close();
  });

  it("should trigger onAfterResponse hook", async () => {
    const app = new Framework()
      .onAfterResponse((a) => {
        expect(a).toBeInstanceOf(Response);
      })
      .get("/after-response", () => ({ success: true }), {
        response: h.object({ success: h.boolean() }),
      });
    app.listen(0);
    while (!app.server?.port) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const client = createClient<typeof app>(`http://127.0.0.1:${app.server!.port}`);
    await client["after-response"].get();

    app.close();
  });
});
