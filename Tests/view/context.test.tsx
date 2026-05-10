/** @vitest-environment happy-dom */
import { ctx, sig, use, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("Context", () => {
  describe("ctx()", () => {
    it("should create context with default value", () => {
      const ThemeCtx = ctx({ mode: "dark" as const, accent: "#00d9ff" });
      expect(ThemeCtx._defaultValue).toEqual({ mode: "dark", accent: "#00d9ff" });
    });

    it("should create context without default", () => {
      const MyCtx = ctx<{ value: number }>();
      expect(MyCtx._defaultValue).toBeUndefined();
    });
  });

  describe("use()", () => {
    it("should return default value when no provider", () => {
      const ThemeCtx = ctx({ mode: "dark" as const });
      const value = use(ThemeCtx);
      expect(value.mode).toBe("dark");
    });

    it("should throw when no default and no provider", () => {
      const MyCtx = ctx<{ value: number }>();
      expect(() => use(MyCtx)).toThrow("Context not found");
    });

    it("should work with reactive values", () => {
      const countCtx = ctx(sig(0));
      const value = use(countCtx);
      expect(val(value)).toBe(0);
    });
  });

  describe("Provider", () => {
    it("should provide value to children", () => {
      const ThemeCtx = ctx({ mode: "dark" as const });
      const Provider = ThemeCtx.Provider;

      expect(typeof Provider).toBe("function");
    });
  });
});
