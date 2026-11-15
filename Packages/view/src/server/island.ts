import type { JSX } from "../jsx.d";
import { jsx } from "../static/jsx-runtime";
import type { Component } from "../types";

export type IslandWhen = "load" | "idle" | "visible" | `media:${string}`;

/** Serialize explicit client props while rejecting lossy, cyclic and executable values. */
export function serializeProps(value: unknown): string {
  const ancestors = new Set<object>();
  const validate = (item: unknown) => {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    ) {
      return;
    }
    if (
      typeof item !== "object" ||
      !item ||
      ancestors.has(item) ||
      (!Array.isArray(item) &&
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null)
    ) {
      throw new TypeError("Island props must be finite, acyclic JSON values");
    }
    ancestors.add(item);
    try {
      if (Object.getOwnPropertySymbols(item).length) {
        throw new TypeError("Island props cannot contain symbols");
      }
      if (Array.isArray(item)) {
        for (let index = 0; index < item.length; index++) {
          if (!Object.hasOwn(item, index)) {
            throw new TypeError("Island props cannot contain sparse arrays");
          }
          validate(item[index]);
        }
      } else {
        for (const child of Object.values(item)) {
          validate(child);
        }
      }
    } finally {
      ancestors.delete(item);
    }
  };
  validate(value);
  return JSON.stringify(value);
}

/** Mark one server-rendered component as an explicit client bundle boundary. */
export function Island<P extends Record<string, unknown>>(props: {
  component: Component<P>;
  src: string;
  props: P;
  when?: IslandWhen;
}): JSX.Element {
  if (!props.src || props.src.includes("\0") || /[\r\n]/.test(props.src)) {
    throw new TypeError("Island src must name a component module");
  }
  const when = props.when ?? "load";
  if (
    !["load", "idle", "visible"].includes(when) &&
    !(when.startsWith("media:") && when.length > 6)
  ) {
    throw new TypeError("Unknown island activation condition");
  }
  return Object.assign(
    jsx("hedystia-island", {
      "data-view-src": props.src,
      "data-view-when": when,
      "data-view-props": serializeProps(props.props),
      children: jsx(props.component, props.props),
    }) as object,
    { __isIsland: true },
  ) as JSX.Element;
}
