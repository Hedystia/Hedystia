import { detectRuntime, isBrowser, isBun, isDeno, isNode } from "@hedystia/ws";
import { describe, expect, it } from "vitest";

describe("@hedystia/ws — runtime detection", () => {
  it("detectRuntime() reports the active runtime", () => {
    const runtime = detectRuntime();
    expect(["bun", "node", "deno", "browser", "unknown"]).toContain(runtime);
  });

  it("isBun() matches the environment", () => {
    const isActuallyBun = !!(process as any).versions?.bun;
    expect(isBun()).toBe(isActuallyBun);
  });

  it("predicates are consistent with the detected runtime", () => {
    const runtime = detectRuntime();
    if (runtime === "bun") {
      expect(isBun()).toBe(true);
      expect(isNode()).toBe(false);
      expect(isDeno()).toBe(false);
      expect(isBrowser()).toBe(false);
    } else if (runtime === "node") {
      expect(isBun()).toBe(false);
      expect(isNode()).toBe(true);
      expect(isDeno()).toBe(false);
      expect(isBrowser()).toBe(false);
    }
  });
});
