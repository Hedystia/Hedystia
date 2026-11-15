/**
 * Render engine for @hedystia/view
 *
 * Mounts components to the DOM and manages the render cycle.
 */

import { Fragment } from "../jsx/element";
import { createRoot, Owner } from "../signal";
import type { Component, Owner as OwnerType } from "../types";
import { flushPending, resolveNodes } from "./flow";
import { hydrateDOM } from "./hydration";

/**
 * Application instance returned by mount
 */
export interface ViewApp {
  dispose: () => void;
  root: OwnerType | null;
}

/**
 * Mount a component to a target DOM element
 * @param {Component<{}>} component - The component to mount
 * @param {HTMLElement} target - The target element
 * @returns {ViewApp} The application instance
 * @example
 * const app = mount(App, document.getElementById("root")!);
 * app.dispose();
 */
export function mount(component: Component<{}>, target: HTMLElement): ViewApp {
  return createApp(component, target, false);
}

/** Hydrate server HTML once, preserving native nodes and connecting direct reactive bindings. */
export function hydrate(component: Component<{}>, target: HTMLElement): ViewApp {
  return createApp(component, target, true);
}

/** Own rendering, hydration and disposal through the same direct DOM application lifecycle. */
function createApp(component: Component<{}>, target: HTMLElement, reuse: boolean): ViewApp {
  if (!reuse) {
    target.replaceChildren();
  }
  let dispose: (() => void) | undefined;
  let root: OwnerType | null = null;
  createRoot((stop) => {
    dispose = stop;
    root = Owner;
    const render = () => {
      const result = component({});
      const nodes = resolveNodes(
        typeof result === "function" ? Fragment({ children: result }) : result,
      );
      const staging = document.createDocumentFragment();
      for (const node of nodes) {
        staging.appendChild(node);
      }
      flushPending(nodes);
      return Array.from(staging.childNodes);
    };
    if (reuse) {
      hydrateDOM(target, render);
    } else {
      for (const node of render()) {
        target.appendChild(node);
      }
    }
  });
  let disposed = false;
  return {
    root,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      try {
        dispose?.();
      } finally {
        target.replaceChildren();
      }
    },
  };
}

export { renderToString } from "../server/render";
