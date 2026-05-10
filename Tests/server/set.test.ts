import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .get(
    "/test-status",
    (context) => {
      context.set.status(201);
      return { message: "Created successfully" };
    },
    {
      response: h.object({ message: h.string() }),
    },
  )
  .get(
    "/test-headers",
    (context) => {
      context.set.headers.set("X-Custom-Header", "custom-value");
      context.set.headers.add("X-Multi-Header", "value1");
      context.set.headers.add("X-Multi-Header", "value2");
      return { message: "Headers set" };
    },
    {
      response: h.object({ message: h.string() }),
    },
  )
  .get(
    "/test-cookies",
    (context) => {
      context.set.cookies.set("session", "abc123", {
        httpOnly: true,
        maxAge: 3600,
        path: "/",
      });
      context.set.cookies.set("theme", "dark");
      return { message: "Cookies set" };
    },
    {
      response: h.object({ message: h.string() }),
    },
  )
  .get(
    "/test-combined",
    (context) => {
      context.set.status(202);
      context.set.headers.set("X-Request-ID", "12345");
      context.set.cookies.set("user_id", "user123");
      return {
        message: "All context features used",
        timestamp: Date.now(),
      };
    },
    {
      response: h.object({
        message: h.string(),
        timestamp: h.number(),
      }),
    },
  )
  .get(
    "/test-cookie-operations",
    (context) => {
      const existingCookie = context.set.cookies.get("theme");

      context.set.cookies.set("new_cookie", "test_value");
      context.set.cookies.delete("old_cookie");

      return {
        existingCookie: existingCookie || "not_found",
        message: "Cookie operations completed",
      };
    },
    {
      response: h.object({
        existingCookie: h.string(),
        message: h.string(),
      }),
    },
  )
  .get(
    "/test-response-validation",
    (context) => {
      context.set.status(200);
      return { name: "John", age: 25 };
    },
    {
      response: h.object({
        name: h.string(),
        age: h.number(),
      }),
    },
  )
  .listen(3028);

const client = createClient<typeof app>("http://127.0.0.1:3028");

describe("Test set context features", () => {
  it("should set custom status code", async () => {
    const response = await fetch("http://127.0.0.1:3028/test-status");
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ message: "Created successfully" });
  });

  it("should set custom headers", async () => {
    const response = await fetch("http://127.0.0.1:3028/test-headers");
    const data = await response.json();

    expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
    expect(response.headers.get("X-Multi-Header")).toBe("value1, value2");
    expect(data).toEqual({ message: "Headers set" });
  });

  it("should set cookies", async () => {
    const response = await fetch("http://127.0.0.1:3028/test-cookies");
    const data = await response.json();

    const setCookie = (response.headers as any).getSetCookie
      ? (response.headers as any).getSetCookie()
      : [response.headers.get("Set-Cookie")];
    const cookies = setCookie.join("; ");
    expect(cookies).toContain("session=abc123");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("Max-Age=3600");
    expect(cookies).toContain("Path=/");
    expect(cookies).toContain("theme=dark");
    expect(data).toEqual({ message: "Cookies set" });
  });

  it("should combine status, headers and cookies", async () => {
    const response = await fetch("http://127.0.0.1:3028/test-combined");
    const data = (await response.json()) as any;

    expect(response.status).toBe(202);
    expect(response.headers.get("X-Request-ID")).toBe("12345");

    const setCookie = (response.headers as any).getSetCookie
      ? (response.headers as any).getSetCookie()
      : [response.headers.get("Set-Cookie")];
    const cookies = setCookie.join("; ");
    expect(cookies).toContain("user_id=user123");

    expect(data).toMatchObject({
      message: "All context features used",
    });
    expect(typeof data.timestamp).toBe("number");
  });

  it("should handle cookie operations", async () => {
    const { data } = await client["test-cookie-operations"].get();

    expect(data).toEqual({
      existingCookie: "not_found",
      message: "Cookie operations completed",
    });
  });

  it("should validate response against schema", async () => {
    const { data, error } = await client["test-response-validation"].get();

    expect(error).toBeNull();
    expect(data).toEqual({ name: "John", age: 25 });
  });

  it("should work with client and return proper data", async () => {
    const { data, error } = await client["test-status"].get();

    expect(error).toBeNull();
    expect(data).toEqual({ message: "Created successfully" });
  });

  afterAll(() => {
    app.close();
  });
});
