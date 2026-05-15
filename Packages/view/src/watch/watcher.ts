/**
 * Watchers and reactive effects for @hedystia/view
 *
 * Provides effect tracking and reactive subscriptions.
 */

import { adopt, cleanupSources, Owner, runComputation, untrack, val } from "../signal";
import type { Accessor, Computation, ReadonlySignal } from "../types";

/** @internal */
type SignalValue<S> =
  S extends ReadonlySignal<infer T> ? T : S extends Accessor<infer T> ? T : never;

/**
 * Create a reactive effect that runs when dependencies change
 */
export function on<T>(track: () => T, run: (value: T, prev: T) => any | (() => void)): () => void {
  let cleanup: (() => void) | undefined;
  let prevValue: T | undefined;
  let hasRun = false;
  let stopped = false;

  const computation: Computation<any> = {
    _fn: () => {
      if (stopped) {
        return undefined;
      }

      // Track dependencies from the track function
      const value = track();

      // Run callback untracked so reads inside run() don't become dependencies
      untrack(() => {
        if (cleanup) {
          cleanup();
          cleanup = undefined;
        }

        const result = run(value, hasRun ? prevValue! : value);
        if (typeof result === "function") {
          cleanup = result;
        }
      });

      prevValue = value;
      hasRun = true;
      return undefined;
    },
    _value: undefined,
    _sources: null,
    _sourceSlots: null,
    _observers: null,
    _observerSlots: null,
    _owner: Owner,
    _owned: null,
    _cleanups: null,
    _context: null,
    _suspense: null,
    _user: true,
    _pure: false,
    _state: 0,
    _updatedAt: null,
  };

  adopt(computation);

  // Run initial execution with proper Listener tracking
  runComputation(computation);

  return () => {
    stopped = true;
    cleanupSources(computation);
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
  };
}

/**
 * Create a one-time effect that runs once and disposes
 */
export function once<T>(track: () => T, run: (value: T) => void): () => void {
  let hasRun = false;
  return on(track, (value) => {
    if (!hasRun) {
      hasRun = true;
      run(value);
    }
  });
}

/**
 * Concise reactive effect — pass a signal or accessor directly instead of a track function.
 *
 * ```ts
 * watch(count, (value, prev) => console.log(value, prev));
 * ```
 */
export function watch<S extends ReadonlySignal<any> | Accessor<any>>(
  signal: S,
  run: (value: SignalValue<S>, prev: SignalValue<S>) => any | (() => void),
): () => void {
  return on(() => val(signal), run);
}

/**
 * Reactive effect that tracks multiple signals or accessors at once.
 *
 * ```ts
 * watchAll([a, b], ([aVal, bVal], [prevA, prevB]) => { });
 * ```
 */
export function watchAll<T extends readonly any[]>(
  signals: [...T],
  run: (
    values: { [K in keyof T]: SignalValue<T[K]> },
    prev: { [K in keyof T]: SignalValue<T[K]> },
  ) => any | (() => void),
): () => void {
  return on(() => signals.map((s) => val(s)) as any, run as any);
}
