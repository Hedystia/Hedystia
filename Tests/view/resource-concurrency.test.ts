/** @vitest-environment happy-dom */
import { createRoot, load, set, sig, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("resource concurrency", () => {
  it.each([
    "resolve",
    "reject",
  ] as const)("ignores a stale %s even when the fetcher ignores cancellation", async (finish) => {
    const key = sig("old");
    const old = deferred<string>();
    const fresh = deferred<string>();
    const signals: AbortSignal[] = [];
    const resource = load(
      () => val(key),
      (value, signal) => {
        signals.push(signal);
        return value === "old" ? old.promise : fresh.promise;
      },
    );
    await flush();
    set(key, "new");
    await flush();
    expect(signals[0]?.aborted).toBe(true);
    fresh.resolve("fresh");
    await flush();
    if (finish === "resolve") {
      old.resolve("stale");
    } else {
      old.reject(new Error("stale"));
    }
    await flush();
    expect(val(resource.data)).toBe("fresh");
    expect(val(resource.error)).toBeUndefined();
    expect(val(resource.state)).toBe("ready");
  });

  it("disposes in-flight requests and prevents a queued fetch after unmount", async () => {
    const task = deferred<string>();
    let signal!: AbortSignal;
    let dispose!: () => void;
    const resource = createRoot((stop) => {
      dispose = stop;
      return load(
        () => "key",
        (_key, nextSignal) => {
          signal = nextSignal;
          return task.promise;
        },
      );
    });
    await flush();
    dispose();
    expect(signal.aborted).toBe(true);
    task.resolve("late");
    await flush();
    expect(val(resource.data)).toBeUndefined();
    let calls = 0;
    createRoot((stop) => {
      load(
        () => 1,
        async () => {
          calls++;
          return 1;
        },
      );
      stop();
    });
    await flush();
    expect(calls).toBe(0);
  });

  it("resets errors while retrying an unresolved resource and handles genuine AbortErrors", async () => {
    const key = sig(1);
    const next = deferred<string>();
    const resource = load(
      () => val(key),
      async (value) => {
        if (value === 1) {
          throw new DOMException("upstream cancelled", "AbortError");
        }
        return next.promise;
      },
    );
    await flush();
    expect(val(resource.state)).toBe("errored");
    expect(val(resource.loading)).toBe(false);
    set(key, 2);
    await flush();
    expect(val(resource.state)).toBe("refreshing");
    expect(val(resource.error)).toBeUndefined();
    expect(val(resource.loading)).toBe(true);
    next.resolve("recovered");
    await flush();
    expect(resource.ready).toBe(true);
  });
});
