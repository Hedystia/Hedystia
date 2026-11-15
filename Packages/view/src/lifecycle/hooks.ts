/**
 * Component lifecycle hooks for @hedystia/view
 *
 * Provides onMount, onCleanup, and onReady hooks for component lifecycle.
 */

import { afterHydration } from "../render/hydration";
import { isServerRendering } from "../server/state";
import { createRoot, getOwner, onCleanup as signalOnCleanup } from "../signal";

/**
 * Register a callback to run when the component mounts
 * @param {() => void | (() => void)} fn - The mount callback, optionally returning cleanup
 * @example
 * onMount(() => {
 *   console.log("mounted");
 *   return () => console.log("unmounted");
 * });
 */
export function onMount(fn: () => undefined | (() => void)): void {
  if (isServerRendering() || typeof document === "undefined") {
    return;
  }
  const owner = getOwner();
  let cancelled = false;
  signalOnCleanup(() => {
    cancelled = true;
  });
  afterHydration(() => {
    if (cancelled) {
      return;
    }
    createRoot(() => {
      const result = fn();
      if (typeof result === "function") {
        signalOnCleanup(result);
      }
    }, owner);
  });
}

/**
 * Register a callback to run when the component unmounts
 * @param {() => void} fn - The cleanup callback
 * @example
 * onCleanup(() => {
 *   console.log("cleaning up");
 * });
 */
export function onCleanup(fn: () => void): void {
  signalOnCleanup(fn);
}

/**
 * Register a callback to run when the component is ready (after first render)
 * @param {() => void} fn - The ready callback
 * @example
 * onReady(() => {
 *   console.log("component is ready");
 * });
 */
export function onReady(fn: () => void): void {
  if (isServerRendering() || typeof document === "undefined") {
    return;
  }
  let cancelled = false;
  signalOnCleanup(() => {
    cancelled = true;
  });
  queueMicrotask(() => {
    if (!cancelled) {
      fn();
    }
  });
}
