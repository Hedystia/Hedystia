import { describe, expect, it } from "bun:test";
import { detectRuntime, isBrowser, isBun, isDeno, isNode } from "@hedystia/ws";

describe("@hedystia/ws — runtime detection", () => {
  it("detectRuntime() reports the active runtime", () => {
    const runtime = detectRuntime();
    expect(["bun", "node", "deno", "browser", "unknown"]).toContain(runtime);
  });

  it("isBun() is true under bun:test", () => {
    expect(isBun()).toBe(true);
  });

  it("the other predicates are false on Bun", () => {
    expect(isNode()).toBe(false);
    expect(isDeno()).toBe(false);
    expect(isBrowser()).toBe(false);
  });
});
