import { h } from "@hedystia/validations";
import { describe, expect, it } from "vitest";

describe("validations", () => {
  describe("string", () => {
    const schema = h.string();
    const standard = h.toStandard(schema);

    it("should validate a string", async () => {
      const result = await standard["~standard"].validate("hello");
      expect(result.issues).toBeUndefined();
      if (!result.issues) {
        expect(result.value).toBe("hello");
      }
    });

    it("should fail for non-string", async () => {
      const result = await standard["~standard"].validate(123);
      expect(result.issues).toBeDefined();
    });
  });

  describe("number", () => {
    const schema = h.number();
    const standard = h.toStandard(schema);

    it("should validate a number", async () => {
      const result = await standard["~standard"].validate(123);
      expect(result.issues).toBeUndefined();
      if (!result.issues) {
        expect(result.value).toBe(123);
      }
    });

    it("should fail for non-number", async () => {
      const result = await standard["~standard"].validate("123");
      expect(result.issues).toBeDefined();
    });
  });

  describe("object", () => {
    const schema = h.object({
      name: h.string(),
      age: h.number(),
    });
    const standard = h.toStandard(schema);

    it("should validate a correct object", async () => {
      const input = { name: "John", age: 30 };
      const result = await standard["~standard"].validate(input);
      expect(result.issues).toBeUndefined();
      if (!result.issues) {
        expect(result.value).toEqual(input);
      }
    });

    it("should fail if a field is missing", async () => {
      const input = { name: "John" };
      const result = await standard["~standard"].validate(input);
      expect(result.issues).toBeDefined();
    });

    it("should fail if a field has wrong type", async () => {
      const input = { name: "John", age: "30" };
      const result = await standard["~standard"].validate(input);
      expect(result.issues).toBeDefined();
    });
  });

  describe("array", () => {
    const schema = h.array(h.string());
    const standard = h.toStandard(schema);

    it("should validate a correct array", async () => {
      const input = ["a", "b", "c"];
      const result = await standard["~standard"].validate(input);
      expect(result.issues).toBeUndefined();
      if (!result.issues) {
        expect(result.value).toEqual(input);
      }
    });

    it("should fail for non-array", async () => {
      const result = await standard["~standard"].validate("abc");
      expect(result.issues).toBeDefined();
    });

    it("should fail if an element is wrong type", async () => {
      const input = ["a", 1, "c"];
      const result = await standard["~standard"].validate(input);
      expect(result.issues).toBeDefined();
    });
  });

  describe("union/options", () => {
    const schema = h.options(h.string(), h.number());
    const standard = h.toStandard(schema);

    it("should validate either type", async () => {
      expect((await standard["~standard"].validate("hello")).issues).toBeUndefined();
      expect((await standard["~standard"].validate(123)).issues).toBeUndefined();
    });

    it("should fail for other types", async () => {
      expect((await standard["~standard"].validate(true)).issues).toBeDefined();
    });
  });

  describe("literal", () => {
    const schema = h.literal("exact");
    const standard = h.toStandard(schema);

    it("should validate exact match", async () => {
      const result = await standard["~standard"].validate("exact");
      expect(result.issues).toBeUndefined();
    });

    it("should fail for non-match", async () => {
      const result = await standard["~standard"].validate("other");
      expect(result.issues).toBeDefined();
    });
  });
});
