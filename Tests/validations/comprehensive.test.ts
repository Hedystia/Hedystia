import { h } from "@hedystia/validations";
import { describe, expect, it } from "vitest";

describe("comprehensive validations", () => {
  it("string validation", async () => {
    const schema = h.string();
    const std = h.toStandard(schema);

    expect(await std.parse("hello")).toBe("hello");
    expect((await std.safeParse(123)).issues).toBeDefined();

    // String modifiers
    expect((await h.toStandard(h.string().minLength(5)).safeParse("abc")).issues).toBeDefined();
    expect((await h.toStandard(h.string().maxLength(2)).safeParse("abc")).issues).toBeDefined();
    expect(await h.toStandard(h.string().email()).parse("test@example.com")).toBe(
      "test@example.com",
    );
    expect((await h.toStandard(h.string().email()).safeParse("invalid")).issues).toBeDefined();
    expect(
      await h.toStandard(h.string().uuid()).parse("550e8400-e29b-41d4-a716-446655440000"),
    ).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("number validation", async () => {
    const schema = h.number();
    const std = h.toStandard(schema);

    expect(await std.parse(123)).toBe(123);
    expect((await std.safeParse("123")).issues).toBeDefined();

    // Number modifiers
    expect((await h.toStandard(h.number().min(10)).safeParse(5)).issues).toBeDefined();
    expect((await h.toStandard(h.number().max(10)).safeParse(15)).issues).toBeDefined();
    expect((await h.toStandard(h.number().int()).safeParse(10.5)).issues).toBeDefined();
  });

  it("boolean validation", async () => {
    const std = h.toStandard(h.boolean());
    expect(await std.parse(true)).toBe(true);
    expect(await std.parse(false)).toBe(false);
    expect((await std.safeParse(1)).issues).toBeDefined();
  });

  it("bigint validation", async () => {
    const std = h.toStandard(h.bigint());
    expect(await std.parse(100n)).toBe(100n);
    expect((await std.safeParse(100)).issues).toBeDefined();
  });

  it("any/unknown/never validation", async () => {
    expect(await h.toStandard(h.any()).parse("anything")).toBe("anything");
    expect(await h.toStandard(h.unknown()).parse("something")).toBe("something");
    expect((await h.toStandard(h.never()).safeParse("fail")).issues).toBeDefined();
  });

  it("literal validation", async () => {
    const std = h.toStandard(h.literal("match"));
    expect(await std.parse("match")).toBe("match");
    expect((await std.safeParse("other")).issues).toBeDefined();
  });

  it("object validation", async () => {
    const schema = h.object({
      name: h.string(),
      age: h.number().optional(),
    });
    const std = h.toStandard(schema);

    expect(await std.parse({ name: "Alice", age: 30 })).toEqual({ name: "Alice", age: 30 });
    expect(await std.parse({ name: "Bob" })).toEqual({ name: "Bob" });
    expect((await std.safeParse({ age: 25 })).issues).toBeDefined();
  });

  it("array validation", async () => {
    const schema = h.array(h.string());
    const std = h.toStandard(schema);

    expect(await std.parse(["a", "b"])).toEqual(["a", "b"]);
    expect((await std.safeParse(["a", 1])).issues).toBeDefined();
  });

  it("tuple validation", async () => {
    const schema = h.tuple(h.string(), h.number());
    const std = h.toStandard(schema);

    expect(await std.parse(["a", 1])).toEqual(["a", 1]);
    expect((await std.safeParse(["a", "b"])).issues).toBeDefined();
  });

  it("record validation", async () => {
    const schema = h.record(h.number());
    const std = h.toStandard(schema);

    expect(await std.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect((await std.safeParse({ a: "1" })).issues).toBeDefined();
  });

  it("map validation", async () => {
    const schema = h.map(h.string(), h.number());
    const std = h.toStandard(schema);
    const validMap = new Map([["a", 1]]);

    expect(await std.parse(validMap)).toEqual(validMap);
    expect((await std.safeParse(new Map([["a", "1"]]))).issues).toBeDefined();
  });

  it("set validation", async () => {
    const schema = h.set(h.number());
    const std = h.toStandard(schema);
    const validSet = new Set([1, 2]);

    expect(await std.parse(validSet)).toEqual(validSet);
    expect((await std.safeParse(new Set(["1"]))).issues).toBeDefined();
  });

  it("union validation", async () => {
    const schema = h.union(h.string(), h.number());
    const std = h.toStandard(schema);

    expect(await std.parse("a")).toBe("a");
    expect(await std.parse(1)).toBe(1);
    expect((await std.safeParse(true)).issues).toBeDefined();
  });

  it("discriminated union validation", async () => {
    const schema = h.discriminatedUnion("type", [
      h.object({ type: h.literal("a"), value: h.string() }),
      h.object({ type: h.literal("b"), count: h.number() }),
    ]);
    const std = h.toStandard(schema);

    expect(await std.parse({ type: "a", value: "hello" })).toEqual({ type: "a", value: "hello" });
    expect(await std.parse({ type: "b", count: 42 })).toEqual({ type: "b", count: 42 });
    expect((await std.safeParse({ type: "c" })).issues).toBeDefined();
  });

  it("intersection validation", async () => {
    const schema = h.intersection(h.object({ a: h.string() }), h.object({ b: h.number() }));
    const std = h.toStandard(schema);

    expect(await std.parse({ a: "hi", b: 1 })).toEqual({ a: "hi", b: 1 });
    expect((await std.safeParse({ a: "hi" })).issues).toBeDefined();
  });

  it("lazy validation", async () => {
    type Category = { name: string; sub?: Category[] };
    const schema: any = h.lazy(() =>
      h.object({
        name: h.string(),
        sub: h.array(schema).optional(),
      }),
    );
    const std = h.toStandard(schema);

    const valid: Category = { name: "root", sub: [{ name: "child" }] };
    expect(await std.parse(valid)).toEqual(valid);
  });

  it("default validation", async () => {
    const schema = h.default(h.string(), "default-value");
    const std = h.toStandard(schema);

    expect(await std.parse(undefined)).toBe("default-value");
    expect(await std.parse("provided")).toBe("provided");
  });

  it("transform validation", async () => {
    const schema = h.transform(h.string(), (val) => val.length);
    const std = h.toStandard(schema);

    expect(await std.parse("hello")).toBe(5);
  });

  it("refine validation", async () => {
    const schema = h.refine(h.number(), (val) => val % 2 === 0, "Must be even");
    const std = h.toStandard(schema);

    expect(await std.parse(2)).toBe(2);
    expect((await std.safeParse(3)).issues).toBeDefined();
  });

  it("pipe validation", async () => {
    const schema = h.pipe(h.coerce.number(), h.number().min(10));
    const std = h.toStandard(schema);

    expect(await std.parse("15")).toBe(15);
    expect((await std.safeParse("5")).issues).toBeDefined();
  });

  it("coerce validation", async () => {
    expect(await h.toStandard(h.coerce.string()).parse(123)).toBe("123");
    expect(await h.toStandard(h.coerce.number()).parse("123")).toBe(123);
    expect(await h.toStandard(h.coerce.boolean()).parse("true")).toBe(true);
    expect(await h.toStandard(h.coerce.bigint()).parse("100")).toBe(100n);
  });
});
