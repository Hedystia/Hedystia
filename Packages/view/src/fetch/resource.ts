/**
 * Reactive data fetching for @hedystia/view
 *
 * Provides load() for reactive data fetching and action() for mutations.
 */

import { batch, onCleanup, set, sig, val } from "../signal";
import type { Accessor, Action, Resource } from "../types";
import { on } from "../watch";

/**
 * Create a reactive resource for data fetching
 */
export function load<T, K>(
  key: Accessor<K>,
  fetcher: (key: K, signal: AbortSignal) => Promise<T>,
): Resource<T> {
  const dataSig = sig<T | undefined>(undefined);
  const loadingSig = sig(true);
  const errorSig = sig<Error | undefined>(undefined);
  const stateSig = sig<"unresolved" | "pending" | "ready" | "refreshing" | "errored">("pending");

  let hasResolved = false;
  let currentAbort: AbortController | null = null;
  let disposed = false;

  const execute = async (keyValue: K, controller: AbortController) => {
    if (controller.signal.aborted || disposed) {
      return;
    }
    batch(() => {
      set(loadingSig, true);
      set(errorSig, undefined);
      set(stateSig, hasResolved ? "refreshing" : "pending");
    });

    try {
      const result = await fetcher(keyValue, controller.signal);
      if (controller.signal.aborted || disposed) {
        return;
      }
      hasResolved = true;
      batch(() => {
        set(dataSig, result as T);
        set(errorSig, undefined);
        set(loadingSig, false);
        set(stateSig, "ready");
      });
    } catch (err) {
      if (controller.signal.aborted || disposed) {
        return;
      }
      hasResolved = true;
      batch(() => {
        set(errorSig, err instanceof Error ? err : new Error(String(err)));
        set(loadingSig, false);
        set(stateSig, "errored");
      });
    }
  };

  const stop = on(key, (keyValue) => {
    currentAbort?.abort();
    const controller = new AbortController();
    currentAbort = controller;
    queueMicrotask(() => execute(keyValue, controller));
  });
  onCleanup(() => {
    disposed = true;
    currentAbort?.abort();
    stop();
  });

  const resource = Object.assign(() => val(dataSig), {
    state: stateSig[0],
    loading: loadingSig[0],
    error: errorSig[0],
    data: dataSig[0],
  });
  Object.defineProperty(resource, "ready", {
    get: () => val(stateSig) === "ready",
    enumerable: true,
  });

  return resource as Resource<T>;
}

/**
 * Create a reactive action for mutations
 */
export function action<T, A>(fn: (args: A) => Promise<T>): Action<T, A> {
  const loadingSig = sig(false);
  const errorSig = sig<Error | undefined>(undefined);
  const dataSig = sig<T | undefined>(undefined);

  let pending = 0;
  let latest = 0;

  const run = async (args: A): Promise<T> => {
    const version = ++latest;
    pending++;
    batch(() => {
      set(loadingSig, true);
      set(errorSig, undefined);
    });
    try {
      const result = await fn(args);
      if (version === latest) {
        set(dataSig, result as T);
      }
      return result;
    } catch (error) {
      if (version === latest) {
        set(errorSig, error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    } finally {
      pending--;
      set(loadingSig, pending > 0);
    }
  };

  return Object.assign(run, {
    run,
    loading: loadingSig[0],
    error: errorSig[0],
    data: dataSig[0],
  });
}
