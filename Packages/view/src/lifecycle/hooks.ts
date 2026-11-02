/**
 * Component lifecycle hooks for @hedystia/view
 *
 * Provides onMount, onCleanup, and onReady hooks for component lifecycle.
 */

import { createRoot, onCleanup as signalOnCleanup } from "../signal";

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
  createRoot(() => {
    const result = fn();
    if (typeof result === "function") {
      signalOnCleanup(result);
    }
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
  queueMicrotask(fn);
}
