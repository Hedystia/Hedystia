import { action } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("shared action callable and concurrency contracts", () => {
  it("preserves a newer successful action when an older call fails late", async () => {
    let reject!: (reason: unknown) => void;
    const older = new Promise<number>((_resolve, fail) => {
      reject = fail;
    });
    const save = action(async (value: number) => (value === 1 ? older : value));
    const pending = save(1);
    await save(2);
    reject(new Error("stale"));
    await expect(pending).rejects.toThrow("stale");
    expect(save.data()).toBe(2);
    expect(save.error()).toBeUndefined();
    expect(save.loading()).toBe(false);
  });

  it("supports direct calls and synchronous failures without leaving loading stuck", async () => {
    const save = action<number, void>(() => {
      throw new Error("sync");
    });
    await expect(save()).rejects.toThrow("sync");
    expect(save.loading()).toBe(false);
    expect(save.error()?.message).toBe("sync");
  });

  it("keeps loading true for pending calls and preserves the latest-started result", async () => {
    let resolveFirst!: (value: number) => void;
    const first = new Promise<number>((resolve) => {
      resolveFirst = resolve;
    });
    const save = action(async (value: number) => (value === 1 ? first : value));
    const pending = save.run(1);
    expect(await save(2)).toBe(2);
    expect(save.loading()).toBe(true);
    expect(save.data()).toBe(2);
    resolveFirst(1);
    expect(await pending).toBe(1);
    expect(save.loading()).toBe(false);
    expect(save.data()).toBe(2);
  });
});
