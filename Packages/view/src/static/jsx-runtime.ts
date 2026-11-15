import type { JSX } from "../jsx.d";
import { createStaticNode } from "./node";

/** Represent JSX as static server nodes without importing the browser DOM engine. */
export function jsx<P>(type: string | ((props: P) => unknown), props: P): JSX.Element {
  return createStaticNode(type, props ?? {}) as unknown as JSX.Element;
}

/** Preserve fragments until the server renderer evaluates them inside a disposable owner. */
export function Fragment(props: { children?: unknown }): JSX.Element {
  return props.children as JSX.Element;
}

export type { JSX };
export { jsx as jsxs, jsx as jsxDEV };
