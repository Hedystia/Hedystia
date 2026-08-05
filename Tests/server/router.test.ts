import { describe, expect, it } from "vitest";
import { Router } from "../../Packages/server/src/router";

describe("Router", () => {
  it("prefers static routes over parameter routes", () => {
    const router = new Router();
    router.add("GET", "/users/:id", "param");
    router.add("GET", "/users/new", "static");

    expect(router.find("GET", "/users/new")).toEqual({ handler: "static", params: {} });
    expect(router.find("GET", "/users/42")).toEqual({
      handler: "param",
      params: { id: "42" },
    });
  });

  it("decodes parameter values", () => {
    const router = new Router();
    router.add("GET", "/search/:term", "search");

    expect(router.find("GET", "/search/hello%20world")).toEqual({
      handler: "search",
      params: { term: "hello world" },
    });
  });

  it("captures the remaining path in a wildcard", () => {
    const router = new Router();
    router.add("GET", "/files/*path", "files");

    expect(router.find("GET", "/files/a/b/c.txt")).toEqual({
      handler: "files",
      params: { path: "a/b/c.txt" },
    });
  });

  it("keeps methods isolated for the same path", () => {
    const router = new Router();
    router.add("GET", "/health", "get");
    router.add("POST", "/health", "post");

    expect(router.find("GET", "/health")?.handler).toBe("get");
    expect(router.find("POST", "/health")?.handler).toBe("post");
    expect(router.find("DELETE", "/health")).toBeNull();
  });
});
