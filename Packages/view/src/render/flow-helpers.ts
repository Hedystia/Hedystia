/**
 * Shared flow helpers used by both JSX element creation and flow components.
 * Extracted to avoid circular dependency and enable better tree-shaking.
 */

import { _registerFlowHook } from "../jsx/element";
import { val } from "../signal";

// Register the flushPending hook so the JSX runtime can flush
// pending insertions without importing flow-helpers directly.
_registerFlowHook(flushPending);

/** @internal - Map of markers with pending insertions (for nested flow components) */
export const pendingInsertions = new Map<Comment, () => void>();

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
export function insertNodesAfter(marker: Comment, nodes: Node[]): void {
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
    pendingInsertions.set(marker, doInsert);
    queueMicrotask(() => {
      if (pendingInsertions.has(marker) && marker.parentNode) {
        pendingInsertions.delete(marker);
        doInsert();
      }
    });
  }
}

/** @internal - Remove a node from the DOM if attached */
export function removeNode(node: Node | null): void {
  if (node?.parentNode) {
    node.parentNode.removeChild(node);
  }
}

/** @internal - Remove multiple nodes from the DOM */
export function removeNodes(nodes: Node[]): void {
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
    return resolveNodes(val(content));
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
