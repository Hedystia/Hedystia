import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .get(
    "/",
    () => {
      return "Welcome to API Server";
    },
    {
      response: h.string(),
    },
  )
  .get(
    "/users/get",
    () => {
      return {
        status: "ok",
      };
    },
    {
      response: h.object({ status: h.literal("ok") }),
    },
  )
  .get(
    "/slug/:name",
    (context) => {
      return context.params;
    },
    {
      params: h.object({
        name: h.string(),
      }),
      response: h.object({ name: h.string() }),
    },
  )
  .get(
    "/slug/:name/:id",
    (context) => {
      return context.params;
    },
    {
      params: h.object({
        name: h.string(),
        id: h.string(),
      }),
      response: h.object({ name: h.string(), id: h.string() }),
    },
  )
  .get(
    "/test/test/new/random/:name/:id",
    (context) => {
      return context.params;
    },
    {
      params: h.object({
        id: h.number().coerce(),
        name: h.string(),
      }),
      response: h.object({ id: h.number(), name: h.string() }),
    },
  )
  .get(
    "/headers",
    (context) => {
      return context.headers;
    },
    {
      headers: h.object({
        "x-test-header": h.string(),
      }),
      response: h.object({ "x-test-header": h.string() }),
    },
  )
  .get(
    "/error",
    (context) => {
      const testHeader = context.headers["x-test-header"];

      if (testHeader === "error") {
        context.error(400, "Invalid header value");
      }

      return { "x-test-header": testHeader };
    },
    {
      headers: h.object({
        "x-test-header": h.string(),
      }),
      response: h.object({
        "x-test-header": h.string(),
      }),
      error: h.object({
        message: h.string(),
        code: h.number(),
      }),
    },
  )
  .listen(3000);

const client = createClient<typeof app>("http://localhost:3000");

describe("Test get route", () => {
  it("should return a response", async () => {
    const { data: slug } = await client.slug.name("sally").get();

    expect(slug).toEqual({ name: "sally" });
  });

  it("should return a response", async () => {
    const { data: slug } = await client.slug.name("sally").id("1234").get();

    expect(slug).toEqual({ name: "sally", id: "1234" });
  });

  it("should return a response with params", async () => {
    const { data: test, error } = await client.test.test.new.random.name("sally").id(123).get();

    expect(error).toBeNull();

    expect(test).toEqual({ id: 123, name: "sally" });
  });

  it("should return a response for path ending in 'get'", async () => {
    const { error, data: response } = await client.users.get.get();

    expect(error).toBeNull();

    expect(response).toEqual({ status: "ok" });
  });

  it("should handle root endpoint", async () => {
    const { data, error } = await client.get();

    expect(error).toBeNull();
    expect(data).toBe("Welcome to API Server");
  });

  it("should work with headers", async () => {
    const { data, error } = await client.headers.get({
      headers: {
        "x-test-header": "test-value",
      },
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ "x-test-header": "test-value" });
  });

  it("should return success", async () => {
    const { data, error } = await client.error.get({
      headers: {
        "x-test-header": "test-value",
      },
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ "x-test-header": "test-value" });
  });

  it("should return error", async () => {
    const { data, error } = await client.error.get({
      headers: {
        "x-test-header": "error",
      },
    });

    expect(data).toBeNull();
    expect(error).toMatchObject({
      message: "Invalid header value",
      code: 400,
    });
  });

  afterAll(() => {
    app.close();
  });
});
