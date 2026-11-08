import { h } from "@hedystia/validations";
import { describe, expect, it } from "vitest";

describe("validation regressions", () => {
  it("reports an empty union instead of returning an empty issue list", async () => {
    const union = h.options();

    const result = await union.safeParse(1);
    expect(result.issues?.length).toBeGreaterThan(0);
    expect(result.issues?.[0]?.message).toMatch(/union variant/);
    expect(() => union.parse(1)).toThrow(/union variant/);
  });

  it("keeps strict and passthrough behavior across object composition", async () => {
    const strict = h.object({ id: h.number() }).strict().extend({ name: h.string() });
    const strictResult = await strict.safeParse({ id: 1, name: "x", extra: true });
    expect(strictResult.issues?.some((issue) => issue.message.includes("Unknown key"))).toBe(true);

    const passthrough = h.object({ id: h.number(), name: h.string() }).passthrough().pick(["id"]);
    expect(await passthrough.parse({ id: 1, extra: "kept" })).toEqual({ id: 1, extra: "kept" });
  });

  it("exposes null() and nullable() on schemas returned by toStandard", async () => {
    expect(await h.toStandard(h.string()).null().parse(null)).toBeNull();
    expect(await h.toStandard(h.string()).nullable().parse(null)).toBeNull();
  });

  it("respects regex flags and resets stateful regexes", async () => {
    expect(await h.regex(/^abc$/i).parse("ABC")).toBe("ABC");

    const global = h.regex(/a/g);
    expect(await global.parse("a")).toBe("a");
    expect(await global.parse("a")).toBe("a");
  });

  it("accepts long top-level domains", async () => {
    expect(await h.domain().parse("https://example.technology")).toBe("https://example.technology");
    expect((await h.domain().safeParse("example.technology")).issues).toBeDefined();
  });

  it("accepts the nil UUID", async () => {
    const nil = "00000000-0000-0000-0000-000000000000";
    expect(await h.uuid().parse(nil)).toBe(nil);
  });

  it("handles decimal multipleOf without floating point noise", async () => {
    const tenth = h.number().multipleOf(0.1);
    expect(await tenth.parse(0.3)).toBe(0.3);
    expect(await tenth.parse(0.7)).toBe(0.7);
    expect((await tenth.safeParse(0.35)).issues).toBeDefined();
  });
});
