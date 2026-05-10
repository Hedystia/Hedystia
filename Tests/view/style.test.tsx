/** @vitest-environment happy-dom */
import { merge, style, toCssString } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("Style", () => {
  describe("style()", () => {
    it("should create static style", () => {
      const cardStyle = style({ padding: "16px", background: "#1a1a2e" });
      expect(cardStyle()).toEqual({ padding: "16px", background: "#1a1a2e" });
    });

    it("should create computed style", () => {
      const baseStyle = { padding: "16px" };
      const computedStyle = style(() => ({
        ...baseStyle,
        background: "#1a1a2e",
      }));
      expect(computedStyle()).toEqual({ padding: "16px", background: "#1a1a2e" });
    });
  });

  describe("merge()", () => {
    it("should merge style objects", () => {
      const base = { padding: "16px", background: "#fff" };
      const override = { background: "#000", color: "red" };
      const merged = merge(base, override);
      expect(merged).toEqual({
        padding: "16px",
        background: "#000",
        color: "red",
      });
    });

    it("should handle undefined styles", () => {
      const base = { padding: "16px" };
      const merged = merge(base, undefined, null);
      expect(merged).toEqual({ padding: "16px" });
    });

    it("should merge multiple styles", () => {
      const s1 = { a: "1" };
      const s2 = { b: "2" };
      const s3 = { c: "3" };
      const merged = merge(s1, s2, s3);
      expect(merged).toEqual({ a: "1", b: "2", c: "3" });
    });
  });

  describe("toCssString()", () => {
    it("should convert style to CSS string", () => {
      const css = toCssString({ padding: "16px", color: "red" });
      expect(css).toBe("padding: 16px; color: red;");
    });

    it("should handle camelCase properties", () => {
      const css = toCssString({ backgroundColor: "red", fontSize: "14px" });
      expect(css).toBe("background-color: red; font-size: 14px;");
    });

    it("should handle empty style", () => {
      const css = toCssString({});
      expect(css).toBe("");
    });
  });
});
