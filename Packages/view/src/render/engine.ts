/**
 * Render engine for @hedystia/view
 *
 * Mounts components to the DOM and manages the render cycle.
 */

import { SVG_ATTR_MAP, SVG_ELEMENTS } from "../jsx/element";
import { createRoot, Owner } from "../signal";
import type { Component, Owner as OwnerType } from "../types";
import { resolveNodes } from "./flow";

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
  target.innerHTML = "";

  let dispose: (() => void) | null = null;
  let root: OwnerType | null = null;

  createRoot((disposeFn) => {
    dispose = disposeFn;
    root = Owner;
    const result = component({});
    const nodes = resolveNodes(result);
    for (const node of nodes) {
      target.appendChild(node);
    }
  });

  return {
    dispose: () => {
      if (dispose) {
        dispose();
      }
      target.innerHTML = "";
    },
    root,
  };
}

/**
 * Void elements that don't need closing tags
 */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Serialize a value to an HTML attribute string
 */
function serializeAttrValue(key: string, value: unknown): string | null {
  if (value === undefined || value === null || typeof value === "function") {
    return null;
  }
  // Handle style objects
  if (key === "style" && typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([k, v]) => `${k}:${v}`)
      .join(";");
  }
  if (typeof value === "boolean") {
    return value ? "" : null;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * SSR element representation
 */
interface SSRElement {
  type: unknown;
  props: Record<string, any>;
  __isSSR: true;
}

/**
 * Check if value is an SSR element
 */
function isSSRElement(el: unknown): el is SSRElement {
  return typeof el === "object" && el !== null && "__isSSR" in el;
}

/**
 * Render a JSX element to HTML string (handles both DOM elements and SSR elements)
 */
function renderElement(element: unknown): string {
  if (element === null || element === undefined) {
    return "";
  }
  if (typeof element === "string") {
    return escapeHtml(element);
  }
  if (typeof element === "number") {
    return String(element);
  }
  if (typeof element === "boolean") {
    return "";
  }
  // Handle functions (accessors/signals) - call them and render result
  if (typeof element === "function") {
    const result = element();
    return renderElement(result);
  }
  // Handle arrays (fragments)
  if (Array.isArray(element)) {
    return element.map((child) => renderElement(child)).join("");
  }
  // Handle DOM elements (browser)
  if (typeof HTMLElement !== "undefined" && element instanceof HTMLElement) {
    return element.outerHTML;
  }
  // Handle Comment nodes (Show, For, Index, Switch, etc return comment nodes)
  if (typeof Comment !== "undefined" && element instanceof Comment) {
    return "";
  }
  // Handle SSR elements (server)
  if (isSSRElement(element)) {
    const { type, props } = element;
    if (typeof type === "function") {
      // It's a component function, call it
      const result = type(props);
      return renderElement(result);
    }
    // Intrinsic element (string tag)
    if (typeof type !== "string") {
      return "";
    }
    const tagName = type;
    const attrs: string[] = [];
    let innerHTML = "";

    for (const [key, value] of Object.entries(props || {})) {
      if (key === "children") {
        if (typeof value === "string") {
          innerHTML = escapeHtml(value);
        } else if (typeof value === "number" || typeof value === "boolean") {
          innerHTML = value ? String(value) : "";
        } else {
          innerHTML = renderElement(value);
        }
        continue;
      }
      if (key === "dangerouslySetInnerHTML") {
        innerHTML = value?.__html || "";
        continue;
      }
      if (key === "innerHTML") {
        const val = typeof value === "function" ? value() : value;
        innerHTML = val == null ? "" : String(val);
        continue;
      }
      if (key === "innerText" || key === "textContent") {
        const val = typeof value === "function" ? value() : value;
        innerHTML = val == null ? "" : escapeHtml(String(val));
        continue;
      }
      let attrName = key === "className" ? "class" : key === "htmlFor" ? "for" : key;
      if (SVG_ELEMENTS.has(tagName)) {
        attrName = SVG_ATTR_MAP[attrName] || attrName;
      }
      const serialized = serializeAttrValue(key, value);
      if (serialized === null) {
        continue;
      }
      if (typeof value === "boolean" && value) {
        attrs.push(attrName);
      } else {
        attrs.push(`${attrName}="${escapeHtml(serialized)}"`);
      }
    }

    const attrsStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
    if (VOID_ELEMENTS.has(tagName)) {
      return `<${tagName}${attrsStr}>`;
    }
    return `<${tagName}${attrsStr}>${innerHTML}</${tagName}>`;
  }
  // Handle Match marker objects (from SSR flow components)
  if (typeof element === "object" && element !== null) {
    const obj = element as Record<string, unknown>;
    if ("_matchWhen" in obj) {
      const when = obj._matchWhen as (() => unknown) | unknown;
      const condition = typeof when === "function" ? when() : when;
      if (condition) {
        return renderElement(obj._matchChildren);
      }
      return "";
    }
    if ("nodeType" in obj && obj.nodeType === 8) {
      // Comment node representation in SSR
      return "";
    }
  }
  return "";
}

/**
 * Render a component to a string (for SSR)
 * @param {Component<{}> | unknown} input - The component to render, or a JSX element
 * @returns {string} The rendered HTML string
 * @example
 * const html = renderToString(App);
 */
export function renderToString(input: Component<{}> | unknown): string {
  if (typeof input === "function") {
    const result = input({});
    return renderElement(result);
  }
  return renderElement(input);
}
