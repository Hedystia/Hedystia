import { h, type Infer } from "@hedystia/validations";
import { describe, expect, expectTypeOf, it } from "vitest";

describe("object composition inference", () => {
  it("keeps field types, optionality and replacement semantics", async () => {
    const base = h
      .object({ id: h.string(), name: h.string(), note: h.string().optional() })
      .strict();
    const picked = base.pick(["id", "note"]);
    const omitted = base.omit(["name"]);
    const extended = base.extend({ id: h.number(), active: h.boolean() });
    const merged = base.merge(h.object({ id: h.number() }));
    expectTypeOf<Infer<typeof picked>>().toEqualTypeOf<{ id: string; note?: string | undefined }>();
    expectTypeOf<Infer<typeof omitted>>().toEqualTypeOf<{
      id: string;
      note?: string | undefined;
    }>();
    expectTypeOf<Infer<typeof extended>>().toEqualTypeOf<{
      name: string;
      note?: string | undefined;
      id: number;
      active: boolean;
    }>();
    expectTypeOf<Infer<typeof merged>>().toEqualTypeOf<{
      name: string;
      note?: string | undefined;
      id: number;
    }>();
    expect(await picked.safeParse({ id: "a" })).toEqual({ value: { id: "a" } });
    expect((await picked.safeParse({ id: "a", name: "extra" })).issues).toBeDefined();
    expect(await extended.safeParse({ id: 1, name: "a", active: true })).toEqual({
      value: { id: 1, name: "a", active: true },
    });
    expect((await base.safeParse({ id: 1, name: "a" })).issues).toBeDefined();
    // @ts-expect-error Only declared keys can be selected.
    base.pick(["missing"]);
  });
});
