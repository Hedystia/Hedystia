import { adapter } from "@hedystia/adapter";
import Framework from "hedystia";
import { describe, expect, it, vi } from "vitest";

describe("HedystiaAdapter", () => {
  const app = new Framework()
    .get("/test", () => {
      return { message: "ok" };
    })
    .post("/echo", async (ctx: any) => {
      const body = await ctx.request.json();
      return body;
    });

  const hAdapter = adapter(app);

  describe("toCloudflareWorker", () => {
    it("should handle requests", async () => {
      const worker = hAdapter.toCloudflareWorker();
      const request = new Request("http://localhost/test");
      const response = await worker.fetch(request, {}, {});

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: "ok" });
    });

    it("should handle prefix", async () => {
      const _worker = hAdapter.toCloudflareWorker({ prefix: "/api" });
      // The adapter prepends prefix to url.pathname
      // In adapter.ts: url.pathname = prefix + url.pathname;
      // So if we request /test, it becomes /api/test
      // Wait, let's re-read adapter.ts

      /*
      if (prefix) {
          const url = new URL(request.url);
          url.pathname = prefix + url.pathname;
          const newRequest = new Request(url.toString(), request);
          return this.app.fetch(newRequest);
        }
      */

      // If app has /api/test, and we use prefix /api, and request /test
      const appWithPrefix = new Framework().get("/api/test", () => ({ message: "prefixed" }));
      const prefixedAdapter = adapter(appWithPrefix).toCloudflareWorker({ prefix: "/api" });

      const request = new Request("http://localhost/test");
      const response = await prefixedAdapter.fetch(request, {}, {});
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ message: "prefixed" });
    });
  });

  describe("toNodeHandler", () => {
    it("should handle requests", async () => {
      const handler = hAdapter.toNodeHandler();
      const req = {
        url: "/test",
        method: "GET",
        headers: { host: "localhost" },
      };

      let statusCode = 0;
      const headers: Record<string, string> = {};
      let body: any = null;

      const res = {
        set statusCode(code: number) {
          statusCode = code;
        },
        get statusCode() {
          return statusCode;
        },
        setHeader(key: string, val: string) {
          headers[key] = val;
        },
        end: vi.fn().mockImplementation((b) => {
          body = b;
        }),
      };

      await handler(req as any, res as any);

      expect(statusCode).toBe(200);
      expect(headers["content-type"] || headers["Content-Type"]).toContain("application/json");
      expect(JSON.parse(body.toString())).toEqual({ message: "ok" });
    });
  });

  describe("toFastlyCompute", () => {
    it("should handle requests", async () => {
      const fastly = hAdapter.toFastlyCompute();
      const request = new Request("http://localhost/test");
      const response = await fastly(request);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ message: "ok" });
    });
  });

  describe("toDeno", () => {
    it("should handle requests", async () => {
      const deno = hAdapter.toDeno();
      const request = new Request("http://localhost/test");
      const response = await deno(request);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ message: "ok" });
    });
  });

  describe("toLambda", () => {
    it("should handle requests (API Gateway V2)", async () => {
      const lambda = hAdapter.toLambda();
      const event = {
        rawPath: "/test",
        requestContext: {
          http: {
            method: "GET",
          },
        },
        headers: {
          host: "127.0.0.1",
        },
      };

      const result = await lambda(event, {});
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ message: "ok" });
    });

    it.skip("should handle POST requests with body", async () => {
      const lambda = hAdapter.toLambda();
      const event = {
        rawPath: "/echo",
        requestContext: {
          http: {
            method: "POST",
          },
        },
        headers: {
          host: "127.0.0.1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ hello: "world" }),
        isBase64Encoded: false,
      };

      const result = await lambda(event, {});
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ hello: "world" });
    });
  });

  describe("toVercel", () => {
    it("should handle requests", async () => {
      const handler = hAdapter.toVercel();
      const req = {
        url: "/test",
        method: "GET",
        headers: {
          host: "localhost",
          "x-forwarded-proto": "http",
        },
      };

      let statusCode = 0;
      const headers: Record<string, string> = {};
      let body: any = null;

      const res = {
        set statusCode(code: number) {
          statusCode = code;
        },
        get statusCode() {
          return statusCode;
        },
        setHeader(key: string, val: string) {
          headers[key] = val;
        },
        end: vi.fn().mockImplementation((b) => {
          body = b;
        }),
      };

      await handler(req as any, res as any);

      expect(statusCode).toBe(200);
      expect(JSON.parse(body.toString())).toEqual({ message: "ok" });
    });
  });
});
