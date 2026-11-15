import type { QueryKey } from "@hedystia/query";
import { createQueryClient } from "@hedystia/query";
import { createRoot, set, sig, val } from "@hedystia/view";
import Hedystia, { h } from "hedystia";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

/** Create controllable async work for concurrency tests. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Drain resource and cache microtasks. */
async function flush() {
  for (let index = 0; index < 12; index++) {
    await Promise.resolve();
  }
}

describe("query cache", () => {
  it("deduplicates concurrent callers and caches undefined as a real result", async () => {
    const client = createQueryClient();
    const task = deferred<undefined>();
    const fetcher = vi.fn(() => task.promise);
    const a = client.fetchQuery(["users", { page: 1, active: true }], fetcher);
    const b = client.fetchQuery(["users", { active: true, page: 1 }], fetcher);
    await flush();
    expect(fetcher).toHaveBeenCalledOnce();
    task.resolve(undefined);
    expect(await Promise.all([a, b])).toEqual([undefined, undefined]);
    expect(await client.fetchQuery(["users", { page: 1, active: true }], fetcher)).toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("isolates clients and invalidates structural prefixes without string-prefix collisions", async () => {
    const client = createQueryClient();
    const fetcher = vi.fn(async () => 1);
    await client.fetchQuery(["users", 1], fetcher);
    await client.fetchQuery(["user", 1], fetcher);
    client.invalidate(["users"]);
    await client.fetchQuery(["users", 1], fetcher);
    await client.fetchQuery(["user", 1], fetcher);
    await createQueryClient().fetchQuery(["user", 1], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    () => 1,
    Symbol(),
    new Date(),
    new Map(),
    [undefined, 1],
    { [Symbol()]: 1 },
  ])("rejects ambiguous key value %s", async (value) => {
    const fetcher = vi.fn(async () => 1);
    await expect(
      createQueryClient().fetchQuery([value] as unknown as QueryKey, fetcher),
    ).rejects.toThrow(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects cyclic keys but accepts shared acyclic objects", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(
      createQueryClient().fetchQuery([cyclic] as unknown as QueryKey, async () => 1),
    ).rejects.toThrow(TypeError);
    const shared = { id: 1 };
    expect(await createQueryClient().fetchQuery([shared, shared], async () => 2)).toBe(2);
  });

  it("does not cache failures or start work for already-aborted consumers", async () => {
    const client = createQueryClient();
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(client.fetchQuery(["users"], fetcher)).rejects.toThrow("offline");
    expect(await client.fetchQuery(["users"], async () => 3)).toBe(3);
    await expect(client.fetchQuery(["other"], fetcher, AbortSignal.abort())).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("cancels consumers independently and aborts work when the final consumer leaves", async () => {
    const client = createQueryClient();
    const first = new AbortController();
    const second = new AbortController();
    const task = deferred<number>();
    let shared!: AbortSignal;
    const fetcher = (signal: AbortSignal) => {
      shared = signal;
      return task.promise;
    };
    const a = client.fetchQuery(["users"], fetcher, first.signal);
    const b = client.fetchQuery(["users"], fetcher, second.signal);
    await flush();
    first.abort();
    await expect(a).rejects.toThrow();
    expect(shared.aborted).toBe(false);
    second.abort();
    await expect(b).rejects.toThrow();
    expect(shared.aborted).toBe(true);
    expect(await client.fetchQuery(["users"], async () => 2)).toBe(2);
    task.resolve(1);
    await flush();
    expect(await client.fetchQuery(["users"], async () => 3)).toBe(2);
  });

  it("never lets an invalidated request overwrite a newer cached result", async () => {
    const client = createQueryClient();
    const old = deferred<number>();
    const first = client.fetchQuery(["users"], () => old.promise);
    await flush();
    client.invalidate(["users"]);
    expect(await client.fetchQuery(["users"], async () => 2)).toBe(2);
    old.resolve(1);
    expect(await first).toBe(1);
    expect(await client.fetchQuery(["users"], async () => 3)).toBe(2);
  });

  it("bounds inactive cache retention", async () => {
    const client = createQueryClient();
    const fetcher = vi.fn(async () => 1);
    for (let index = 0; index < 130; index++) {
      await client.fetchQuery([index], fetcher);
    }
    await client.fetchQuery([129], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(130);
    await client.fetchQuery([0], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(131);
  });
});

describe("reactive queries and mutations", () => {
  it("connects a typed HTTP client to a shared reactive resource without opening a port", async () => {
    const app = new Hedystia().get(
      "/users/:id",
      ({ params }) => ({ id: params.id, name: "Alice" }),
      {
        params: h.object({ id: h.number().coerce() }),
        response: h.object({ id: h.number(), name: h.string() }),
      },
    );
    const api = createClient<typeof app>("http://localhost", {
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    });
    const queries = createQueryClient();
    let dispose!: () => void;
    const user = createRoot((stop) => {
      dispose = stop;
      return queries.query(
        () => ["users", 7] as const,
        async (key, signal) => {
          const result = await api.users.id(key[1]).get({ signal });
          if (!result.ok) {
            throw result.error;
          }
          return result.data;
        },
      );
    });
    await vi.waitFor(() => expect(user.ready).toBe(true));
    expect(user()).toEqual({ id: 7, name: "Alice" });
    expectTypeOf(user()).toEqualTypeOf<{ id: number; name: string } | null | undefined>();
    dispose();
  });

  it("aborts shared work when the final reactive owner is disposed", async () => {
    const queries = createQueryClient();
    let signal!: AbortSignal;
    let dispose!: () => void;
    const task = deferred<number>();
    const resource = createRoot((stop) => {
      dispose = stop;
      return queries.query(
        () => ["users"],
        (_key, currentSignal) => {
          signal = currentSignal;
          return task.promise;
        },
      );
    });
    await flush();
    dispose();
    expect(signal.aborted).toBe(true);
    task.resolve(10);
    await flush();
    expect(resource()).toBeUndefined();
    expect(await queries.fetchQuery(["users"], async () => 20)).toBe(20);
  });

  it("shares work across owners and preserves another mounted consumer on disposal", async () => {
    const client = createQueryClient();
    const task = deferred<number>();
    const fetcher = vi.fn((_key: readonly [string], signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return task.promise;
    });
    let disposeA!: () => void;
    let disposeB!: () => void;
    const a = createRoot((dispose) => {
      disposeA = dispose;
      return client.query(() => ["users"] as const, fetcher);
    });
    const b = createRoot((dispose) => {
      disposeB = dispose;
      return client.query(() => ["users"] as const, fetcher);
    });
    await flush();
    disposeA();
    task.resolve(4);
    await flush();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(a()).toBeUndefined();
    expect(b()).toBe(4);
    expectTypeOf(b()).toEqualTypeOf<number | undefined>();
    disposeB();
  });

  it("tracks changing keys and refetches only successfully invalidated resources", async () => {
    const client = createQueryClient();
    const key = sig(1);
    let value = 0;
    const fetcher = vi.fn(async (key: readonly [string, number]) => `${key[1]}:${++value}`);
    let dispose!: () => void;
    const resource = createRoot((stop) => {
      dispose = stop;
      return client.query(() => ["users", val(key)] as const, fetcher);
    });
    await flush();
    expect(resource()).toBe("1:1");
    set(key, 2);
    await flush();
    expect(resource()).toBe("2:2");
    const fail = client.mutation(
      async () => {
        throw new Error("denied");
      },
      { invalidate: [["users"]] },
    );
    await expect(fail.run(undefined)).rejects.toThrow("denied");
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const save = client.mutation(async (name: string) => name, { invalidate: [["users"]] });
    expect(await save("Alice")).toBe("Alice");
    await flush();
    expect(resource()).toBe("2:3");
    expectTypeOf(save.data()).toEqualTypeOf<string | undefined>();
    dispose();
  });

  it("keeps mounted entries subscribed when inactive entries are evicted", async () => {
    const client = createQueryClient();
    let value = 0;
    let dispose!: () => void;
    const resource = createRoot((stop) => {
      dispose = stop;
      return client.query(
        () => ["pinned"],
        async () => ++value,
      );
    });
    await flush();
    for (let index = 0; index < 130; index++) {
      await client.fetchQuery([index], async () => index);
    }
    client.invalidate(["pinned"]);
    await flush();
    expect(resource()).toBe(2);
    dispose();
  });
});

import { createClient } from "@hedystia/client";
