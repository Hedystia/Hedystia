import { schemaToTypeString } from "@hedystia/types";
import { h } from "@hedystia/validations";
import { describe, expect, it } from "vitest";

describe("schemaToTypeString", () => {
  it("should handle basic types", () => {
    expect(schemaToTypeString(h.string())).toBe("string");
    expect(schemaToTypeString(h.number())).toBe("number");
    expect(schemaToTypeString(h.boolean())).toBe("boolean");
    expect(schemaToTypeString(h.null())).toBe("null");
    expect(schemaToTypeString(h.any())).toBe("any");
  });

  it("should handle optional types", () => {
    expect(schemaToTypeString(h.optional(h.string()))).toBe("string | undefined");
  });

  it("should handle array types", () => {
    expect(schemaToTypeString(h.array(h.string()))).toBe("string[]");
    expect(schemaToTypeString(h.array(h.optional(h.string())))).toBe("(string | undefined)[]");
  });

  it("should handle union types", () => {
    expect(schemaToTypeString(h.union(h.string(), h.number()))).toBe("string | number");
  });

  it("should handle literal types", () => {
    expect(schemaToTypeString(h.literal("hello"))).toBe("'hello'");
    expect(schemaToTypeString(h.literal(123))).toBe("123");
    expect(schemaToTypeString(h.literal(true))).toBe("true");
  });

  it("should handle object types", () => {
    const schema = h.object({
      name: h.string(),
      age: h.optional(h.number()),
      "special-key": h.string(),
    });
    expect(schemaToTypeString(schema)).toBe('{name:string;age?:number;"special-key":string}');
  });

  it("should handle nested object types", () => {
    const schema = h.object({
      user: h.object({
        id: h.number(),
      }),
    });
    expect(schemaToTypeString(schema)).toBe("{user:{id:number}}");
  });

  it("should handle instanceOf types", () => {
    class MyClass {}
    expect(schemaToTypeString(h.instanceOf(MyClass))).toBe("MyClass");
  });

  it("should return any for unknown or null schemas", () => {
    expect(schemaToTypeString(null)).toBe("any");
    expect(schemaToTypeString(undefined)).toBe("any");
  });
});
