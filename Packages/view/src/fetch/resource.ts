/**
 * Reactive data fetching for @hedystia/view
 *
 * Provides load() for reactive data fetching and action() for mutations.
 */

import { batch, set, sig, val } from "../signal";
import type { Accessor, Action, Resource } from "../types";
import { on } from "../watch";

/**
 * Create a reactive resource for data fetching
 */
export function load<T, K>(key: Accessor<K>, fetcher: (key: K) => Promise<T>): Resource<T> {
  const dataSig = sig<T | undefined>(undefined);
  const loadingSig = sig(true);
  const errorSig = sig<Error | undefined>(undefined);
  const stateSig = sig<"unresolved" | "pending" | "ready" | "refreshing" | "errored">("pending");

  let hasResolved = false;
  let currentAbort: AbortController | null = null;

  const execute = async (keyValue: K) => {
    if (currentAbort) {
      currentAbort.abort();
    }
    currentAbort = new AbortController();

    if (hasResolved) {
      batch(() => {
        set(loadingSig, true);
        set(stateSig, "refreshing");
      });
    }

    try {
      const result = await fetcher(keyValue);
      batch(() => {
        set(dataSig, result as T);
        set(errorSig, undefined);
        set(loadingSig, false);
        set(stateSig, "ready");
      });
      hasResolved = true;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      batch(() => {
        set(errorSig, err instanceof Error ? err : new Error(String(err)));
        set(loadingSig, false);
        set(stateSig, "errored");
      });
      hasResolved = true;
    }
  };

  on(key, (keyValue) => {
    queueMicrotask(() => execute(keyValue));
  });

  const resource: Resource<T> = {
    state: stateSig[0],
    loading: loadingSig[0],
    error: errorSig[0],
    data: dataSig[0],
    get ready() {
      return val(stateSig) === "ready";
    },
  } as Resource<T>;

  return resource;
}

/**
 * Create a reactive action for mutations
 */
export function action<T, A>(fn: (args: A) => Promise<T>): Action<T, A> {
  const loadingSig = sig(false);
  const errorSig = sig<Error | undefined>(undefined);
  const dataSig = sig<T | undefined>(undefined);

  const run = (args: A): Promise<T> => {
    set(loadingSig, true);
    set(errorSig, undefined);

    return fn(args)
      .then((result) => {
        set(dataSig, result as T);
        set(loadingSig, false);
        return result;
      })
      .catch((err) => {
        set(errorSig, err instanceof Error ? err : new Error(String(err)));
        set(loadingSig, false);
        throw err;
      });
  };

  const actionFn: Action<T, A> = {
    run,
    loading: loadingSig[0],
    error: errorSig[0],
    data: dataSig[0],
  } as Action<T, A>;

  return actionFn;
}
