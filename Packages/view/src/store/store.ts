/**
 * Global store system for @hedystia/view
 *
 * Provides reactive state management with nested path access.
 * Uses Proxy for fine-grained reactivity on nested properties.
 */

import { $STORE } from "../constants";
import { batch, set as setSignal, sig, val } from "../signal";
import type { Signal, Store, StoreValue } from "../types";

/**
 * Create a reactive store from an initial state object
 */
export function store<T extends Record<string, StoreValue>>(initial: T): Store<T> {
  const signals = createSignals(initial);
  const proxy = new Proxy(signals, {
    get(target, prop) {
      if (prop === $STORE) {
        return true;
      }
      const value = target[prop as keyof typeof target];
      if (typeof value === "object" && value !== null && $STORE in value) {
        return value;
      }
      return value;
    },
  }) as Store<T>;
  return proxy;
}

/** @internal */
function createSignals(obj: Record<string, StoreValue>): any {
  const result: any = {};

  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) {
      continue;
    }
    const value = obj[key];

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = createSignals(value as Record<string, StoreValue>);
      Object.defineProperty(result[key], $STORE, { value: true, enumerable: false });
    } else if (Array.isArray(value)) {
      const arraySignals = value.map((item) => {
        if (typeof item === "object" && item !== null) {
          return createSignals(item as Record<string, StoreValue>);
        }
        return sig(item);
      });
      result[key] = sig(arraySignals);
    } else {
      result[key] = sig(value);
    }
  }

  Object.defineProperty(result, $STORE, { value: true, enumerable: false });
  return result;
}

/**
 * Deep partial update of a store node
 */
export function patch(storeNode: any, partial: Record<string, any>): void {
  batch(() => {
    for (const key in partial) {
      if (!Object.hasOwn(partial, key)) {
        continue;
      }
      const value = partial[key];
      const node = storeNode[key];
      if (typeof node === "object" && node !== null && $STORE in node && !("_value" in node)) {
        patch(node, value);
      } else if (
        (typeof node === "object" || typeof node === "function") &&
        node !== null &&
        "_value" in node
      ) {
        setSignal(node as Signal<any>, value);
      }
    }
  });
}

/**
 * Reset a store to its initial values
 */
export function reset(storeInstance: any, initial: Record<string, StoreValue>): void {
  batch(() => {
    for (const key in initial) {
      if (!Object.hasOwn(initial, key)) {
        continue;
      }
      const value = initial[key];
      const node = storeInstance[key];
      if (typeof node === "object" && node !== null && $STORE in node && !("_value" in node)) {
        reset(node, value as Record<string, StoreValue>);
      } else if (
        (typeof node === "object" || typeof node === "function") &&
        node !== null &&
        "_value" in node
      ) {
        setSignal(node as Signal<any>, value);
      }
    }
  });
}

/**
 * Create a plain snapshot of a store node
 */
export function snap(storeNode: any): any {
  const result: any = {};

  for (const key in storeNode) {
    if (!Object.hasOwn(storeNode, key)) {
      continue;
    }
    const value = storeNode[key];
    if (typeof value === "object" && value !== null && $STORE in value && !("_value" in value)) {
      result[key] = snap(value);
    } else if (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "_value" in value
    ) {
      result[key] = val(value as Signal<any>);
    } else {
      result[key] = value;
    }
  }

  return result;
}
