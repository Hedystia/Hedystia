/**
 * Typed context system for @hedystia/view
 *
 * Provides provider/consumer pattern for dependency injection.
 */

import { effect } from "../jsx/element";
import type { JSX } from "../jsx.d";
import { Owner, set, sig, val } from "../signal";
import type { Accessor, Component, Context } from "../types";

/**
 * Create a typed context for dependency injection
 * @template T - The type of the context value
 * @param {T} [defaultValue] - Optional default value
 * @returns {Context<T>} A context object with Provider
 * @example
 * const ThemeCtx = ctx<{ mode: "dark" | "light"; accent: string }>();
 */
export function ctx<T>(defaultValue?: T): Context<T> {
  const id = Symbol("context");

  const Provider: Component<{ value: T | Accessor<T>; children: JSX.Element }> = (props) => {
    if (Owner) {
      if (!Owner._context) {
        Owner._context = {};
      }

      const initialValue =
        typeof props.value === "function" ? (props.value as Accessor<T>)() : props.value;
      const valueSignal = sig(initialValue);
      Owner._context[id] = valueSignal;

      if (typeof props.value === "function") {
        effect(() => {
          set(valueSignal, (props.value as Accessor<T>)());
        });
      }
    }

    return props.children;
  };

  return {
    _id: id,
    _defaultValue: defaultValue,
    Provider,
  };
}

/**
 * Consume a context value
 * @template T - The type of the context value
 * @param {Context<T>} context - The context to consume
 * @returns {T} The context value
 * @throws {Error} When context is not found and no default exists
 * @example
 * const theme = use(ThemeCtx);
 */
export function use<T>(context: Context<T>): T {
  let curr = Owner;
  while (curr) {
    if (curr._context && context._id in curr._context) {
      return val(curr._context[context._id]);
    }
    curr = curr._owner;
  }

  if (context._defaultValue !== undefined) {
    return context._defaultValue;
  }
  throw new Error(`Context not found: ${String(context._id)}`);
}
