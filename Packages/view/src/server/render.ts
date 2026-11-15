import { SVG_ATTR_MAP, SVG_ELEMENTS } from "../dom/svg";
import { createRoot } from "../signal";
import { isStaticNode } from "../static/node";
import type { Component } from "../types";
import { islandSource, renderIsland, withServerRender } from "./state";
import { isRawHTML } from "./trusted";

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
 * Convert a camelCase style property to its CSS kebab-case form
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
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
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${camelToKebab(k)}:${v}`)
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
  __isIsland?: boolean;
}

/**
 * Check if value is an SSR element
 */
function isSSRElement(el: unknown): el is SSRElement {
  return isStaticNode(el);
}

/**
 * Render a JSX element to HTML string (handles both DOM elements and SSR elements)
 */
function renderElement(element: unknown): string {
  if (isRawHTML(element)) {
    return element.html;
  }
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
    if (element.__isIsland) {
      return renderIsland(() =>
        renderElement({
          ...element,
          __isIsland: false,
          props: {
            ...element.props,
            "data-view-src": islandSource(String(element.props["data-view-src"])),
          },
        }),
      );
    }
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
    if (!/^[a-zA-Z][a-zA-Z0-9:._-]*$/.test(tagName)) {
      throw new TypeError("Invalid static element name");
    }
    const attrs: string[] = [];
    let innerHTML = "";

    const classSet = new Set<string>();
    const normalizeClass = (v: any): string => {
      if (Array.isArray(v)) {
        return v
          .map((i) => (typeof i === "function" ? i() : i))
          .filter(Boolean)
          .join(" ");
      }
      return String(typeof v === "function" ? v() : (v ?? ""));
    };

    for (const [key, value] of Object.entries(props || {})) {
      if (/^on/i.test(key)) {
        continue;
      }
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
      if (key === "class" || key === "className") {
        const classes = normalizeClass(value);
        for (const c of classes.split(" ")) {
          if (c) {
            classSet.add(c);
          }
        }
        continue;
      }
      if (key === "classList" && typeof value === "object" && value !== null) {
        for (const [c, cond] of Object.entries(value)) {
          const isTrue = typeof cond === "function" ? (cond as any)() : cond;
          if (isTrue) {
            classSet.add(c);
          }
        }
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
      let propValue = value;
      if (
        typeof value === "function" &&
        (key === "value" || key === "checked" || key === "selected" || key === "style")
      ) {
        propValue = value();
      }
      if (key === "value" && tagName === "textarea") {
        innerHTML = propValue == null ? "" : escapeHtml(String(propValue));
        continue;
      }
      let attrName = key === "className" ? "class" : key === "htmlFor" ? "for" : key;
      if (SVG_ELEMENTS.has(tagName)) {
        attrName = SVG_ATTR_MAP[attrName] || attrName;
      }
      const serialized = serializeAttrValue(key, propValue);
      if (serialized === null) {
        continue;
      }
      if (typeof propValue === "boolean" && propValue) {
        attrs.push(attrName);
      } else {
        attrs.push(`${attrName}="${escapeHtml(serialized)}"`);
      }
    }

    if (classSet.size > 0) {
      attrs.push(`class="${escapeHtml(Array.from(classSet).join(" "))}"`);
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
  return createRoot((dispose) => {
    try {
      return withServerRender(() => renderElement(typeof input === "function" ? input({}) : input));
    } finally {
      dispose();
    }
  });
}
