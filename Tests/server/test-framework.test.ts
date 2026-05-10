import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .get("/ping", () => ({ pong: true }), {
    response: h.object({ pong: h.boolean() }),
    test: async ({ createRequest, expect }) => {
      const { response, statusCode } = await createRequest({});
      expect(response.pong).toBe(true);
      expect(statusCode).toBe(200);
    },
  })
  .get("/users/:id", ({ params }) => ({ id: params.id, name: "John" }), {
    params: h.object({ id: h.number().coerce() }),
    response: h.object({ id: h.number(), name: h.string() }),
    test: async ({ createRequest, expect }) => {
      const { response, statusCode } = await createRequest({
        params: { id: 123 },
      });
      expect(statusCode).toBe(200);
      expect(response.id).toBe(123);
      expect(response.name).toBe("John");
    },
  })
  .post("/users", ({ body }) => ({ id: 1, name: body.name, email: body.email }), {
    body: h.object({ name: h.string(), email: h.string() }),
    response: h.object({
      id: h.number(),
      name: h.string(),
      email: h.string(),
    }),
    test: async ({ createRequest, expect }) => {
      const { response, statusCode } = await createRequest({
        body: { name: "John Doe", email: "john@example.com" },
      });
      expect(statusCode).toBe(200);
      expect(response.id).toBe(1);
      expect(response.name).toBe("John Doe");
      expect(response.email).toBe("john@example.com");
    },
  })
  .get("/search", ({ query }) => ({ query: query.q, limit: query.limit || 10 }), {
    query: h.object({
      q: h.string(),
      limit: h.number().coerce().optional(),
    }),
    response: h.object({ query: h.string(), limit: h.number() }),
    test: async ({ createRequest, expect }) => {
      const { response } = await createRequest({
        query: { q: "hedystia", limit: 20 },
      });
      expect(response.query).toBe("hedystia");
      expect(response.limit).toBe(20);
    },
  })
  .get("/no-test", () => ({ ok: true }), {
    response: h.object({ ok: h.boolean() }),
  })
  .get("/fail-test", () => ({ value: 42 }), {
    response: h.object({ value: h.number() }),
    test: async ({ createRequest, expect }) => {
      const { response } = await createRequest({});
      expect(response.value).toBe(999);
    },
  })
  .get("/number-test", () => ({ age: 25 }), {
    response: h.object({ age: h.number() }),
    test: async ({ createRequest, expect }) => {
      const { response } = await createRequest({});
      expect(response.age).toBeGreaterThan(18);
      expect(response.age).toBeLessThan(100);
      expect(response.age).toBeGreaterThanOrEqual(25);
      expect(response.age).toBeLessThanOrEqual(25);
    },
  })
  .get("/float-test", () => ({ pi: Math.PI }), {
    response: h.object({ pi: h.number() }),
    test: async ({ createRequest, expect }) => {
      const { response } = await createRequest({});
      expect(response.pi).toBeCloseTo(3.14, 1);
      expect(response.pi).toBeCloseTo(Math.PI, 4);
    },
  })
  .get("/array-test", () => ({ items: [1, 2, 3, 4, 5] }), {
    response: h.object({ items: h.number().array() }),
    test: async ({ createRequest, expect }) => {
      const { response } = await createRequest({});
      expect(response.items).toContain(3);
      expect(response.items).toHaveLength(5);
      expect(response.items).not.toContain(99);
    },
  })
  .get("/object-test", () => ({ user: { name: "Alice", age: 30 } }), {
    response: h.object({ user: h.object({ name: h.string(), age: h.number() }) }),
    test: async ({ createRequest, expect }) => {
      const { response } = await createRequest({});
      expect(response.user).toHaveProperty("name");
      expect(response.user).toHaveProperty("age");
    },
  })
  .get("/string-test", () => ({ message: "Hello World" }), {
    response: h.object({ message: h.string() }),
    test: async ({ createRequest, expect }) => {
      const { response } = await createRequest({});
      expect(response.message).toMatch(/World/);
      expect(response.message).toMatch("Hello");
      expect(response.message).toContain("World");
    },
  })
  .get("/strict-test", () => ({ value: 42, text: "42" }), {
    response: h.object({ value: h.number(), text: h.string() }),
    test: async ({ createRequest, expect }) => {
      const { response } = await createRequest({});
      expect(response.value).toBe(42);
      expect(response.value).toEqual(42);
      expect(response.value).not.toEqual("42");
      expect(response.value).toStrictEqual(42);
    },
  })
  .get("/truthiness-test", () => ({ bool: true, empty: "", zero: 0, nullVal: null }), {
    response: h.object({
      bool: h.boolean(),
      empty: h.string(),
      zero: h.number(),
      nullVal: h.any(),
    }),
    test: async ({ createRequest, expect }) => {
      const { response } = await createRequest({});
      expect(response.bool).toBeTruthy();
      expect(response.empty).toBeFalsy();
      expect(response.zero).toBeFalsy();
      expect(response.nullVal).toBeNull();
    },
  })
  .delete(
    "/items/:id",
    (ctx) => {
      if (ctx.params.id > 1000) {
        ctx.set.status(404);
        return "Not found";
      }
      return { deleted: ctx.params.id };
    },
    {
      params: h.object({ id: h.number().coerce() }),
      response: h.object({ deleted: h.number() }).optional(),
      test: async ({ createRequest, expect }) => {
        const { response: res1, statusCode: code1 } = await createRequest({
          params: { id: 123 },
        });
        expect(code1).toBe(200);
        expect(res1?.deleted).toBe(123);

        const { statusCode: code2 } = await createRequest({
          params: { id: 1001 },
        });
        expect(code2).toBe(404);
      },
    },
  )
  .listen(3027);

describe("Route Testing Framework", () => {
  it("should run all route tests and return results", async () => {
    const results = await app.runTests();

    expect(results.total).toBeGreaterThan(0);
    expect(results.passed).toBeGreaterThan(0);
    expect(results.failed).toBeGreaterThanOrEqual(1);
  });

  it("should include correct results for passing tests", async () => {
    const results = await app.runTests();

    const pingResult = results.results.find((r) => r.path === "/ping");
    expect(pingResult).toBeDefined();
    expect(pingResult!.passed).toBe(true);
    expect(pingResult!.method).toBe("GET");
    expect(pingResult!.assertions).toBeGreaterThan(0);
  });

  it("should include correct results for failing tests", async () => {
    const results = await app.runTests();

    const failResult = results.results.find((r) => r.path === "/fail-test");
    expect(failResult).toBeDefined();
    expect(failResult!.passed).toBe(false);
    expect(failResult!.error).toBeDefined();
  });

  it("should not include routes without tests", async () => {
    const results = await app.runTests();

    const noTestResult = results.results.find((r) => r.path === "/no-test");
    expect(noTestResult).toBeUndefined();
  });

  it("should generate a formatted report", async () => {
    const results = await app.runTests();

    expect(results.report).toContain("Route Tests Report");
    expect(results.report).toContain("✅");
    expect(results.report).toContain("❌");
    expect(results.report).toContain("FAILED ✗");
  });

  it("should handle tests with params correctly", async () => {
    const results = await app.runTests();

    const usersResult = results.results.find((r) => r.path === "/users/:id");
    expect(usersResult).toBeDefined();
    expect(usersResult!.passed).toBe(true);
  });

  it("should handle tests with body correctly", async () => {
    const results = await app.runTests();

    const postResult = results.results.find((r) => r.path === "/users");
    expect(postResult).toBeDefined();
    expect(postResult!.passed).toBe(true);
  });

  it("should handle tests with query correctly", async () => {
    const results = await app.runTests();

    const searchResult = results.results.find((r) => r.path === "/search");
    expect(searchResult).toBeDefined();
    expect(searchResult!.passed).toBe(true);
  });

  it("should handle tests with multiple createRequest calls", async () => {
    const results = await app.runTests();

    const deleteResult = results.results.find((r) => r.path === "/items/:id");
    expect(deleteResult).toBeDefined();
    expect(deleteResult!.passed).toBe(true);
  });

  it("should test number comparisons with toBeGreaterThan", async () => {
    const results = await app.runTests();

    const numberResult = results.results.find((r) => r.path === "/number-test");
    expect(numberResult).toBeDefined();
    expect(numberResult!.passed).toBe(true);
  });

  it("should test decimal precision with toBeCloseTo", async () => {
    const results = await app.runTests();

    const floatResult = results.results.find((r) => r.path === "/float-test");
    expect(floatResult).toBeDefined();
    expect(floatResult!.passed).toBe(true);
  });

  it("should test array containment and length", async () => {
    const results = await app.runTests();

    const arrayResult = results.results.find((r) => r.path === "/array-test");
    expect(arrayResult).toBeDefined();
    expect(arrayResult!.passed).toBe(true);
  });

  it("should test object properties with toHaveProperty", async () => {
    const results = await app.runTests();

    const objectResult = results.results.find((r) => r.path === "/object-test");
    expect(objectResult).toBeDefined();
    expect(objectResult!.passed).toBe(true);
  });

  it("should test string matching", async () => {
    const results = await app.runTests();

    const stringResult = results.results.find((r) => r.path === "/string-test");
    expect(stringResult).toBeDefined();
    expect(stringResult!.passed).toBe(true);
  });

  it("should test equality comparisons with toEqual and toStrictEqual", async () => {
    const results = await app.runTests();

    const strictResult = results.results.find((r) => r.path === "/strict-test");
    expect(strictResult).toBeDefined();
    expect(strictResult!.passed).toBe(true);
  });

  it("should test truthiness with toBeTruthy and toBeFalsy", async () => {
    const results = await app.runTests();

    const truthResult = results.results.find((r) => r.path === "/truthiness-test");
    expect(truthResult).toBeDefined();
    expect(truthResult!.passed).toBe(true);
  });

  it("should support .not negation for assertions", async () => {
    const results = await app.runTests();

    const arrayResult = results.results.find((r) => r.path === "/array-test");
    expect(arrayResult).toBeDefined();
    expect(arrayResult!.passed).toBe(true);
  });

  afterAll(() => {
    app.close();
  });
});
