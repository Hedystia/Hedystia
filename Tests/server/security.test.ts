import Framework, { h, SecurityInputError, sanitizeInput } from "hedystia";
import { describe, expect, it } from "vitest";

describe("Security controls", () => {
  it("sanitizes dangerous keys without changing normal strings", () => {
    const input = JSON.parse('{"name":" Alice ","__proto__":{"polluted":true}}');
    const output = sanitizeInput(input, { trimStrings: true });

    expect(output).toEqual({ name: "Alice" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("can reject prototype-pollution keys", () => {
    expect(() =>
      sanitizeInput(JSON.parse('{"constructor":{"prototype":{}}}'), { mode: "reject" }),
    ).toThrow(SecurityInputError);
  });

  it("applies security headers and request IDs globally", async () => {
    const app = new Framework({
      security: {
        headers: { preset: "basic" },
        requestId: true,
      },
    }).get("/health", (ctx) => ({ requestId: ctx.requestId }));

    const response = await app.fetch(
      new Request("http://localhost/health", {
        headers: { "X-Request-ID": "request-123" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Request-ID")).toBe("request-123");
    expect(await response.json()).toEqual({ requestId: "request-123" });
  });

  it("sanitizes and validates route bodies", async () => {
    const app = new Framework({
      security: { sanitize: { trimStrings: true } },
    }).post("/users", (ctx) => ctx.body, {
      body: h.object({ name: h.string() }),
    });

    const response = await app.fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"name":" Alice ","__proto__":{"admin":true}}',
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Alice" });
  });

  it("rejects oversized bodies before parsing", async () => {
    const app = new Framework({ security: { bodyLimit: 10 } }).post("/payload", (ctx) => ctx.body);
    const response = await app.fetch(
      new Request("http://localhost/payload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "20",
        },
        body: JSON.stringify({ value: "too large" }),
      }),
    );

    expect(response.status).toBe(413);
    expect((await response.json()).message).toContain("maximum allowed size");
  });

  it("returns 429 and rate-limit headers after the configured limit", async () => {
    const app = new Framework({
      security: {
        rateLimit: { windowMs: 60_000, limit: 1 },
      },
    }).get("/limited", () => ({ ok: true }));

    const first = await app.fetch(new Request("http://localhost/limited"));
    const second = await app.fetch(new Request("http://localhost/limited"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("RateLimit-Limit")).toBe("1");
    expect(second.headers.get("RateLimit-Remaining")).toBe("0");
    expect(second.headers.get("Retry-After")).toBeDefined();
  });

  it("supports route-level security overrides", async () => {
    const app = new Framework({
      security: { headers: { preset: "basic" } },
    }).get("/public", () => "ok", { security: false });

    const response = await app.fetch(new Request("http://localhost/public"));

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Frame-Options")).toBeNull();
  });

  it("applies global security to not-found responses", async () => {
    const app = new Framework({
      security: {
        headers: { preset: "basic" },
        requestId: true,
      },
    });

    const response = await app.fetch(new Request("http://localhost/missing"));

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Request-ID")).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  });

  it("inherits security through grouped routes", async () => {
    const app = new Framework({
      security: { headers: { preset: "basic" } },
    });
    app.group("/api", (group) => group.get("/health", () => "ok"));

    const response = await app.fetch(new Request("http://localhost/api/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("replaces invalid request IDs instead of reflecting them", async () => {
    const app = new Framework({ security: { requestId: true } }).get("/id", (ctx) => ctx.requestId);
    const response = await app.fetch(
      new Request("http://localhost/id", {
        headers: { "X-Request-ID": "invalid value with spaces" },
      }),
    );

    expect(response.headers.get("X-Request-ID")).not.toBe("invalid value with spaces");
    expect(response.headers.get("X-Request-ID")).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  });

  it("returns a timeout response for slow handlers", async () => {
    const app = new Framework({ security: { timeout: 5 } }).get("/slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "done";
    });

    const response = await app.fetch(new Request("http://localhost/slow"));

    expect(response.status).toBe(408);
    expect((await response.json()).message).toBe("Request timed out");
  });
});
