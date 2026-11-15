import { action, load, onCleanup, val } from "@hedystia/view";
import { QueryCache } from "../cache/cache";
import type { QueryKey } from "../cache/key";

export type FetchQueryOptions = { signal?: AbortSignal; staleTime?: number };

/** Create an isolated query cache using View's existing resource and mutation lifecycles. */
export function createQueryClient() {
  const cache = new QueryCache();

  /** Read or fetch one key without requiring a reactive owner. */
  const fetchQuery = async <T>(
    key: QueryKey,
    fetcher: (signal: AbortSignal) => Promise<T>,
    signalOrOptions?: AbortSignal | FetchQueryOptions,
  ) => {
    const options =
      signalOrOptions && "aborted" in signalOrOptions
        ? { signal: signalOrOptions }
        : (signalOrOptions ?? {});
    const staleTime = options.staleTime ?? Number.POSITIVE_INFINITY;
    if (typeof staleTime !== "number" || staleTime < 0 || Number.isNaN(staleTime)) {
      throw new RangeError("staleTime must be non-negative");
    }
    options.signal?.throwIfAborted();
    return cache.fetch(cache.entry(key), fetcher, options.signal, staleTime);
  };

  /** Refetch mounted queries matching a prefix and expire their cached values. */
  const invalidate = (prefix: QueryKey = []) => cache.invalidate(prefix);

  /** Bind a reactive key to a shared, independently cancellable resource. */
  const query = <T, K extends QueryKey>(
    key: () => K,
    fetcher: (key: K, signal: AbortSignal) => Promise<T>,
  ) => {
    let current: ReturnType<QueryCache["entry"]> | undefined;
    onCleanup(() => {
      if (current) {
        current.observers--;
      }
      cache.trim();
    });
    return load(
      () => {
        const value = key();
        const entry = cache.entry(value);
        if (current !== entry) {
          if (current) {
            current.observers--;
          }
          current = entry;
          current.observers++;
          cache.trim();
        }
        return { entry, key: value, revision: val(entry.revision) };
      },
      (value, signal) =>
        cache.fetch(value.entry, (sharedSignal) => fetcher(value.key, sharedSignal), signal),
    );
  };

  /** Run a mutation using View actions and invalidate prefixes only after success. */
  const mutation = <T, A>(
    fn: (args: A) => Promise<T>,
    options: { invalidate?: readonly QueryKey[] } = {},
  ) =>
    action(async (args: A) => {
      const result = await fn(args);
      for (const prefix of options.invalidate ?? []) {
        invalidate(prefix);
      }
      return result;
    });

  return { query, fetchQuery, invalidate, mutation };
}
