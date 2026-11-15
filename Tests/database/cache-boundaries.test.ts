import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../Packages/database/src/cache/memory-store";

afterEach(() => vi.useRealTimers());

describe("bounded query cache", () => {
  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid capacity %s", (capacity) => {
    expect(() => new MemoryStore(capacity)).toThrow(RangeError);
  });
  it("updates an existing entry at capacity without evicting another", () => {
    const store = new MemoryStore(2);
    store.set("a", 1, 1000);
    store.set("b", 2, 1000);
    store.set("b", 3, 1000);
    expect(store.get("a")).toBe(1);
    expect(store.get("b")).toBe(3);
    expect(store.size).toBe(2);
  });
  it("evicts empty-string keys while enforcing the capacity", () => {
    const store = new MemoryStore(1);
    store.set("", 1, 1000);
    store.set("next", 2, 1000);
    expect(store.size).toBe(1);
    expect(store.has("")).toBe(false);
  });
  it("expires at the exact TTL boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const store = new MemoryStore();
    store.set("read", 1, 10);
    store.set("has", 2, 10);
    vi.advanceTimersByTime(10);
    expect(store.get("read")).toBeUndefined();
    expect(store.has("has")).toBe(false);
  });
  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("does not retain invalid TTL %s", (ttl) => {
    const store = new MemoryStore();
    store.set("key", 1, 100);
    store.set("key", 2, ttl);
    expect(store.has("key")).toBe(false);
  });
});
