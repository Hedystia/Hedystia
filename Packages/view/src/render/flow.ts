/**
 * Flow components for @hedystia/view
 *
 * Provides Show, For, Index, Switch, Match, Portal, Suspense, ErrorBoundary.
 */

import { effect } from "../jsx/element";
import { tick } from "../scheduler";
import { onCleanup as signalOnCleanup } from "../signal";
import type { Accessor } from "../types";

/**
 * Check if running in browser
 */
const isBrowser = typeof document !== "undefined";

/** @internal - Map of markers with pending insertions (for nested flow components) */
const pendingInsertions = new Map<Comment, () => void>();

/** @internal - After inserting nodes, flush any pending insertions for markers among them */
export function flushPending(nodes: Node[]): void {
  for (const node of nodes) {
    if (node instanceof Comment && pendingInsertions.has(node)) {
      const pending = pendingInsertions.get(node)!;
      pendingInsertions.delete(node);
      pending();
    }
  }
}

/** @internal - Insert multiple nodes sequentially after a marker */
function insertNodesAfter(marker: Comment, nodes: Node[]): void {
  const doInsert = () => {
    if (marker.parentNode) {
      let ref: Node = marker;
      for (const node of nodes) {
        if (!node.parentNode) {
          marker.parentNode!.insertBefore(node, ref.nextSibling);
        }
        ref = node;
      }
      flushPending(nodes);
    }
  };

  if (marker.parentNode) {
    doInsert();
  } else {
    // If no parent yet, we wait a bit, but also we can check if it's attached later.
    pendingInsertions.set(marker, doInsert);
    // Use queueMicrotask as a fallback
    queueMicrotask(() => {
      if (pendingInsertions.has(marker) && marker.parentNode) {
        pendingInsertions.delete(marker);
        doInsert();
      }
    });
  }
}

/** @internal - Remove a node from the DOM if attached */
function removeNode(node: Node | null): void {
  if (node?.parentNode) {
    node.parentNode.removeChild(node);
  }
}

/** @internal - Remove multiple nodes from the DOM */
function removeNodes(nodes: Node[]): void {
  for (const node of nodes) {
    removeNode(node);
  }
}

/** @internal - Resolve any content value into an array of DOM nodes */
export function resolveNodes(content: any): Node[] {
  if (content == null || content === false) {
    return [];
  }
  if (typeof content === "function") {
    return resolveNodes(content());
  }
  if (Array.isArray(content)) {
    const result: Node[] = [];
    for (const item of content) {
      result.push(...resolveNodes(item));
    }
    return result;
  }
  if (content instanceof DocumentFragment) {
    return Array.from(content.childNodes);
  }
  if (
    content instanceof HTMLElement ||
    content instanceof Text ||
    content instanceof Comment ||
    (typeof SVGElement !== "undefined" && content instanceof SVGElement)
  ) {
    return [content];
  }
  if (typeof content === "string" || typeof content === "number") {
    return [document.createTextNode(String(content))];
  }
  return [];
}

/**
 * Conditionally render children based on a condition
 */
export function Show<T>(props: { when: T | Accessor<T>; fallback?: any; children: any }): any {
  // SSR mode: evaluate condition and return appropriate content
  if (!isBrowser) {
    const cond = typeof props.when === "function" ? (props.when as Accessor<T>)() : props.when;
    if (cond && props.children) {
      return typeof props.children === "function" ? props.children() : props.children;
    }
    if (props.fallback) {
      return typeof props.fallback === "function" ? props.fallback() : props.fallback;
    }
    return "";
  }

  const container = document.createComment("show");
  const currentNodes: Node[] = [];

  effect(() => {
    const cond = typeof props.when === "function" ? (props.when as Accessor<T>)() : props.when;

    removeNodes(currentNodes);
    currentNodes.length = 0;

    if (cond) {
      const nodes = resolveNodes(props.children);
      currentNodes.push(...nodes);
    } else if (props.fallback) {
      const nodes = resolveNodes(props.fallback);
      currentNodes.push(...nodes);
    }

    if (currentNodes.length > 0) {
      insertNodesAfter(container, currentNodes);
    }
  });

  return container;
}

/**
 * Render a list with keyed items for efficient updates
 */
export function For<T>(props: {
  each: T[] | Accessor<T[]>;
  key?: (item: T) => string | number;
  children: (item: T, index: number) => any;
}): any {
  // SSR mode: render all items
  if (!isBrowser) {
    const items = typeof props.each === "function" ? (props.each as Accessor<T[]>)() : props.each;
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }
    return items.map((item, i) => {
      return props.children(item, i);
    });
  }

  const container = document.createComment("for");
  let currentNodes: Node[] = [];

  effect(() => {
    const items = typeof props.each === "function" ? (props.each as Accessor<T[]>)() : props.each;

    // Remove old nodes
    removeNodes(currentNodes);
    currentNodes = [];

    // Create new nodes
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const child = props.children(item, i);
      // Children callback can return a single node or an array
      const nodes = resolveNodes(child);
      currentNodes.push(...nodes);
    }

    // Insert all nodes
    insertNodesAfter(container, currentNodes);
  });

  return container;
}

/**
 * Render a list with index-based tracking
 */
export function Index<T>(props: {
  each: T[] | Accessor<T[]>;
  children: (item: T, index: number) => any;
}): any {
  // SSR mode: render all items by index
  if (!isBrowser) {
    const items = typeof props.each === "function" ? (props.each as Accessor<T[]>)() : props.each;
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }
    return items.map((item, i) => {
      return props.children(item, i);
    });
  }

  const container = document.createComment("index");
  let currentNodes: Node[] = [];

  effect(() => {
    const items = typeof props.each === "function" ? (props.each as Accessor<T[]>)() : props.each;

    // Remove old nodes
    removeNodes(currentNodes);
    currentNodes = [];

    // Create new nodes
    for (let i = 0; i < items.length; i++) {
      const child = props.children(items[i]!, i);
      const nodes = resolveNodes(child);
      currentNodes.push(...nodes);
    }

    // Insert all nodes
    insertNodesAfter(container, currentNodes);
  });

  return container;
}

/**
 * Switch component for mutually exclusive conditions
 */
export function Switch(props: { fallback?: any; children: any }): any {
  // SSR mode: evaluate matches
  if (!isBrowser) {
    const children = props.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === "object" && "_matchWhen" in child) {
          const when = (child as any)._matchWhen;
          const condition = typeof when === "function" ? when() : when;
          if (condition) {
            return (child as any)._matchChildren;
          }
        }
      }
    }
    return props.fallback || "";
  }

  const container = document.createComment("switch");
  let currentNodes: Node[] = [];

  effect(() => {
    const children = props.children;
    let matched: any = null;

    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && (child as any)._matchWhen) {
          const when = (child as any)._matchWhen;
          const condition = typeof when === "function" ? when() : when;
          if (condition) {
            matched = (child as any)._matchChildren;
            break;
          }
        }
      }
    }

    if (!matched) {
      matched = props.fallback;
    }

    removeNodes(currentNodes);
    currentNodes = [];

    if (matched) {
      currentNodes = resolveNodes(matched);
      if (currentNodes.length > 0) {
        insertNodesAfter(container, currentNodes);
      }
    }
  });

  return container;
}

/**
 * Match component for use inside Switch
 */
export function Match<T>(props: { when: T | Accessor<T>; children: any }): any {
  // SSR mode: return marker object
  if (!isBrowser) {
    const marker: Record<string, unknown> = {};
    marker._matchWhen = typeof props.when === "function" ? props.when : () => props.when;
    marker._matchChildren = props.children;
    return marker;
  }

  const marker = document.createComment("match");
  (marker as any)._matchWhen = typeof props.when === "function" ? props.when : () => props.when;
  (marker as any)._matchChildren = props.children;
  return marker;
}

/**
 * Portal component for rendering outside the current DOM hierarchy
 */
export function Portal(props: { mount?: HTMLElement; children: any }): any {
  // SSR mode: just render children inline
  if (!isBrowser) {
    if (typeof props.children === "function") {
      return props.children();
    }
    return props.children;
  }

  const container = document.createComment("portal");
  const mountPoint = props.mount || document.body;
  const rendered: Node[] = [];

  const doRender = () => {
    removeNodes(rendered);
    const nodes = resolveNodes(props.children);
    rendered.length = 0;
    rendered.push(...nodes);
    for (const node of rendered) {
      mountPoint.appendChild(node);
    }
  };

  effect(() => {
    if (container.parentNode) {
      doRender();
    } else {
      pendingInsertions.set(container, doRender);
    }
  });

  signalOnCleanup(() => {
    removeNodes(rendered);
  });

  return container;
}

/**
 * Suspense component for async loading states
 */
export function Suspense(props: { fallback?: any; children: any }): any {
  const container = document.createComment("suspense");
  let renderedNodes: Node[] = [];
  let fallbackNodes: Node[] = [];

  tick(() => {
    try {
      if (fallbackNodes.length > 0) {
        removeNodes(fallbackNodes);
        fallbackNodes = [];
      }
      if (renderedNodes.length === 0 && props.children) {
        renderedNodes = resolveNodes(props.children);
        if (renderedNodes.length > 0) {
          insertNodesAfter(container, renderedNodes);
        }
      }
    } catch {
      if (renderedNodes.length > 0) {
        removeNodes(renderedNodes);
        renderedNodes = [];
      }
      if (props.fallback && fallbackNodes.length === 0) {
        fallbackNodes = resolveNodes(props.fallback);
        if (fallbackNodes.length > 0) {
          insertNodesAfter(container, fallbackNodes);
        }
      }
    }
  });

  return container;
}

/**
 * ErrorBoundary component for catching render errors
 */
export function ErrorBoundary(props: {
  fallback: (err: Error, reset: () => void) => any;
  children: any;
}): any {
  const container = document.createComment("error-boundary");
  let renderedNodes: Node[] = [];
  let error: Error | null = null;

  const reset = () => {
    error = null;
    removeNodes(renderedNodes);
    renderedNodes = [];
    tick(() => {
      try {
        renderedNodes = resolveNodes(props.children);
        if (renderedNodes.length > 0) {
          insertNodesAfter(container, renderedNodes);
        }
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        removeNodes(renderedNodes);
        renderedNodes = [];
        const fallback = props.fallback(error, reset);
        renderedNodes = resolveNodes(fallback);
        if (renderedNodes.length > 0) {
          insertNodesAfter(container, renderedNodes);
        }
      }
    });
  };

  tick(() => {
    try {
      renderedNodes = resolveNodes(props.children);
      if (renderedNodes.length > 0) {
        insertNodesAfter(container, renderedNodes);
      }
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      const fallback = props.fallback(error, reset);
      renderedNodes = resolveNodes(fallback);
      if (renderedNodes.length > 0) {
        insertNodesAfter(container, renderedNodes);
      }
    }
  });

  return container;
}
