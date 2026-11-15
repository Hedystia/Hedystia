/**
 * JSX element creation for @hedystia/view
 *
 * Creates real DOM nodes directly from JSX, no Virtual DOM.
 * Supports both intrinsic elements (strings) and functional components.
 */

import { SVG_ATTR_MAP, SVG_ELEMENTS, SVG_NS } from "../dom/svg";

export { SVG_ATTR_MAP, SVG_ELEMENTS, SVG_NS } from "../dom/svg";

import type { JSX } from "../jsx.d";
import { flushPending, resolveNodes } from "../render/flow";
import { onHydrate, stageNode } from "../render/hydration";
import { tick } from "../scheduler";
import { isRawHTML } from "../server/trusted";
import { adopt, Owner, onCleanup, runComputation, val } from "../signal";
import { createStaticNode } from "../static/node";
import type { Accessor, Computation } from "../types";

/**
 * Function component type
 */
export type FunctionComponent<P = {}> = (props: P & { children?: JSX.Element }) => JSX.Element;

/**
 * Element type - can be a string (intrinsic) or a function component
 */
export type ElementType<P = {}> = string | ((props: P) => JSX.Element);

/**
 * Check if running in browser environment
 */
const isBrowser = typeof document !== "undefined";

/**
 * Create a real DOM element from JSX props
 * @param {ElementType} type - The element type (string or function component)
 * @param {Record<string, any>} props - The element props
 * @returns {JSX.Element} The created DOM element or component result
 * @example
 * const div = jsx("div", { className: "card", children: "Hello" });
 * const MyComponent = (props: { text: string }) => <div>{props.text}</div>;
 * const component = jsx(MyComponent, { text: "Hello" });
 */
export function jsx<P>(type: ElementType<P>, props: P): JSX.Element {
  const { children, ...rest } = (props || {}) as Record<string, any>;

  // Handle function components
  if (typeof type === "function") {
    return type(props);
  }

  // SSR mode: return serializable element representation
  if (!isBrowser) {
    return createStaticNode(type, { children, ...rest }) as unknown as JSX.Element;
  }

  // Handle intrinsic elements (strings)
  const isSvg = SVG_ELEMENTS.has(type);
  const element = isSvg ? document.createElementNS(SVG_NS, type) : document.createElement(type);

  for (const key in rest) {
    if (!Object.hasOwn(rest, key)) {
      continue;
    }
    const value = (rest as Record<string, any>)[key];
    applyProp(element, key, value, isSvg);
  }

  if (children !== undefined && children !== null) {
    applyChildren(element, children);
  }

  return element as unknown as JSX.Element;
}

/**
 * Create a fragment (multiple children without wrapper)
 * @param {ElementType} type - The element type (string or function component)
 * @param {Record<string, any>} props - The element props
 * @returns {JSX.Element | (HTMLElement | Text | Comment)[]} The fragment children or element
 * @example
 * const fragment = jsxs("fragment", { children: [div1, div2] });
 * const MyComponent = (props: { items: string[] }) => <>{props.items.map(item => <span>{item}</span>)}</>;
 * const component = jsxs(MyComponent, { items: ["a", "b"] });
 */
export function jsxs<P>(
  type: ElementType<P>,
  props: P,
): JSX.Element | (HTMLElement | SVGElement | Text | Comment)[] {
  const { children, ...rest } = (props || {}) as Record<string, any>;

  // Handle function components
  if (typeof type === "function") {
    return type(props);
  }

  // Handle Fragment
  if (type === "fragment" || type === "Fragment") {
    if (!isBrowser) {
      return children ?? null;
    }
    if (Array.isArray(children)) {
      return flattenChildren(children);
    }
    return children ?? null;
  }

  // SSR mode
  if (!isBrowser) {
    return createStaticNode(type, { children, ...rest }) as unknown as JSX.Element;
  }

  // Handle intrinsic elements (strings)
  const isSvg = SVG_ELEMENTS.has(type);
  const element = isSvg ? document.createElementNS(SVG_NS, type) : document.createElement(type);

  for (const key in rest) {
    if (!Object.hasOwn(rest, key)) {
      continue;
    }
    const value = (rest as Record<string, any>)[key];
    applyProp(element, key, value, isSvg);
  }

  if (children !== undefined && children !== null) {
    applyChildren(element, children);
  }

  return element as unknown as JSX.Element;
}

/**
 * Fragment component for multiple children
 */
export function Fragment(props: {
  children?: JSX.Children;
}): JSX.Element | (HTMLElement | SVGElement | Text | Comment)[] {
  const { children } = props;
  if (!isBrowser) {
    return children as JSX.Element;
  }
  if (children == null) {
    return null;
  }
  if (Array.isArray(children)) {
    return flattenChildren(children);
  }
  if (typeof children === "function") {
    const container = document.createDocumentFragment();
    applyReactiveChild(container, children as () => JSX.Child | JSX.Child[]);
    return container;
  }
  return children as JSX.Element;
}

/** @internal - Eager effect for DOM side effects (unlike memo which is lazy) */
export function effect(fn: () => void): void {
  const computation: Computation<any> = {
    _fn: () => {
      fn();
      return undefined;
    },
    _value: undefined,
    _sources: null,
    _sourceSlots: null,
    _observers: null,
    _observerSlots: null,
    _owner: Owner,
    _owned: null,
    _cleanups: null,
    _context: null,
    _suspense: null,
    _user: true,
    _pure: false,
    _state: 0,
    _updatedAt: null,
  };
  adopt(computation);
  runComputation(computation);
}

/** @internal */
function applyProp(element: Element, key: string, value: any, isSvg = false): void {
  if (value === undefined || value === null) {
    return;
  }
  onHydrate((resolve) => {
    element = resolve(element);
  });

  const attrName = isSvg ? SVG_ATTR_MAP[key] || key : key === "htmlFor" ? "for" : key;

  if (key.startsWith("on") && typeof value === "function") {
    const eventName = key.slice(2).toLowerCase();
    element.addEventListener(eventName, value);
    let original: Element | undefined = element;
    onHydrate(() => {
      if (original && element !== original) {
        original.removeEventListener(eventName, value);
        element.addEventListener(eventName, value);
      }
      original = undefined;
    });
    onCleanup(() => element.removeEventListener(eventName, value));
  } else if (key === "style") {
    const el = element as HTMLElement | SVGElement;
    if (typeof value === "string") {
      el.style.cssText = value;
    } else if (typeof value === "object") {
      applyStyle(el, value);
    } else if (typeof value === "function") {
      applyReactiveStyle(el, value);
    }
  } else if (key === "classList" && typeof value === "object" && value !== null) {
    for (const className in value) {
      const condition = value[className];
      if (typeof condition === "function") {
        effect(() => {
          const isTrue = val(condition);
          element.classList.toggle(className, !!isTrue);
        });
      } else {
        element.classList.toggle(className, !!condition);
      }
    }
  } else if (key === "class" || key === "className") {
    const normalize = (v: any) => {
      if (Array.isArray(v)) {
        return v
          .map((i) => (typeof i === "function" ? val(i) : i))
          .filter(Boolean)
          .join(" ");
      }
      return String(v ?? "");
    };

    if (
      typeof value === "function" ||
      (Array.isArray(value) && value.some((i) => typeof i === "function"))
    ) {
      effect(() => {
        element.setAttribute("class", normalize(typeof value === "function" ? value() : value));
      });
    } else {
      element.setAttribute("class", normalize(value));
    }
  } else if (key === "innerHTML" || key === "innerText" || key === "textContent") {
    if (typeof value === "function") {
      effect(() => {
        const val = value();
        (element as HTMLElement)[key] = val == null ? "" : String(val);
      });
    } else {
      (element as HTMLElement)[key] = String(value);
    }
  } else if (key === "ref" && typeof value === "function") {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    tick(() => {
      if (!cancelled) {
        value(element);
      }
    });
  } else if ((key === "value" || key === "checked") && !isSvg && key in element) {
    const setProp = (v: any) => {
      if (key === "checked") {
        if (v) {
          if (!element.hasAttribute(attrName)) {
            element.setAttribute(attrName, "");
          }
        } else if (element.hasAttribute(attrName)) {
          element.removeAttribute(attrName);
        }
      } else if (element.tagName !== "TEXTAREA") {
        const s = v == null ? "" : String(v);
        if (element.getAttribute(attrName) !== s) {
          element.setAttribute(attrName, s);
        }
      }
      try {
        if (key === "checked") {
          (element as HTMLInputElement).checked = !!v;
        } else {
          const s = v == null ? "" : String(v);
          const el = element as HTMLInputElement;
          if (el.value !== s) {
            el.value = s;
          }
        }
      } catch {}
    };
    if (typeof value === "function") {
      effect(() => setProp(value()));
    } else {
      setProp(value);
    }
  } else if (typeof value === "function" && !key.startsWith("on")) {
    applyReactiveProp(element, attrName, value);
  } else {
    if (typeof value === "boolean") {
      if (value) {
        element.setAttribute(attrName, "");
      }
    } else {
      element.setAttribute(attrName, String(value));
    }
  }
}

/** @internal */
function applyStyle(element: HTMLElement | SVGElement, style: Record<string, any>): void {
  for (const key in style) {
    if (!Object.hasOwn(style, key)) {
      continue;
    }
    const value = style[key];
    if (value !== undefined && value !== null) {
      const cssKey = camelToKebab(key);
      element.style.setProperty(cssKey, String(value));
    }
  }
}

/** @internal */
function applyReactiveStyle(
  element: HTMLElement | SVGElement,
  accessor: Accessor<Record<string, any>>,
): void {
  onHydrate((resolve) => {
    element = resolve(element);
  });
  let applied: string[] = [];
  effect(() => {
    const style = accessor();
    const next: string[] = [];
    if (style !== null && typeof style === "object") {
      for (const key in style) {
        if (!Object.hasOwn(style, key)) {
          continue;
        }
        const value = style[key];
        if (value !== undefined && value !== null) {
          next.push(camelToKebab(key));
        }
      }
    }
    for (const cssKey of applied) {
      if (!next.includes(cssKey)) {
        element.style.removeProperty(cssKey);
      }
    }
    if (style !== null && typeof style === "object") {
      applyStyle(element, style);
    }
    applied = next;
  });
}

/** @internal */
function applyReactiveProp(element: Element, key: string, accessor: Accessor<any>): void {
  onHydrate((resolve) => {
    element = resolve(element);
  });
  effect(() => {
    const value = accessor();
    if (value === undefined || value === null || value === false) {
      element.removeAttribute(key);
    } else if (value === true) {
      element.setAttribute(key, "");
    } else {
      element.setAttribute(key, String(value));
    }
  });
}

/** @internal */
function applyChildren(element: Element | DocumentFragment, children: JSX.Children): void {
  if (Array.isArray(children)) {
    for (let i = 0; i < children.length; i++) {
      appendSingleChild(element, children[i]);
    }
  } else {
    appendSingleChild(element, children);
  }
}

/** @internal */
function appendSingleChild(element: Element | DocumentFragment, child: JSX.Child): void {
  if (child === null || child === undefined || child === false) {
    return;
  }
  if (isRawHTML(child)) {
    const template = document.createElement("template");
    template.innerHTML = child.html;
    element.appendChild(template.content);
  } else if (Array.isArray(child)) {
    for (let i = 0; i < child.length; i++) {
      appendSingleChild(element, child[i]);
    }
  } else if (typeof child === "function") {
    applyReactiveChild(element, child);
  } else if (typeof child === "string" || typeof child === "number") {
    element.appendChild(document.createTextNode(String(child)));
  } else if (
    child instanceof HTMLElement ||
    child instanceof Text ||
    child instanceof Comment ||
    child instanceof DocumentFragment ||
    (typeof SVGElement !== "undefined" && child instanceof SVGElement)
  ) {
    element.appendChild(stageNode(child));
    if (child instanceof Comment || child instanceof DocumentFragment) {
      flushPending([child]);
    }
  }
}

/** @internal */
function applyReactiveChild(
  element: Element | DocumentFragment,
  accessor: () => JSX.Child | JSX.Child[],
): void {
  let marker = document.createComment("");
  element.appendChild(marker);
  let currentNodes: Node[] = [];
  onHydrate((resolve) => {
    marker = resolve(marker);
    currentNodes = currentNodes.map(resolve);
  });

  effect(() => {
    const value = accessor();

    if (
      (typeof value === "string" || typeof value === "number") &&
      currentNodes.length === 1 &&
      currentNodes[0]!.nodeType === 3
    ) {
      const text = String(value);
      if (currentNodes[0]!.textContent !== text) {
        currentNodes[0]!.textContent = text;
      }
      return;
    }
    const next = resolveNodes(value);
    if (
      next.length === currentNodes.length &&
      next.every((node, index) => node === currentNodes[index])
    ) {
      return;
    }
    for (const node of currentNodes) {
      if (!next.includes(node)) {
        node.parentNode?.removeChild(node);
      }
    }
    let anchor: Node = marker;
    for (let index = next.length - 1; index >= 0; index--) {
      const node = next[index]!;
      if (node.parentNode !== marker.parentNode || node.nextSibling !== anchor) {
        marker.parentNode!.insertBefore(node, anchor);
      }
      anchor = node;
    }
    currentNodes = next;
    flushPending(next);
  });
}

/** @internal */
function flattenChildren(children: JSX.Child[]): Array<HTMLElement | SVGElement | Text | Comment> {
  const result: Array<HTMLElement | SVGElement | Text | Comment> = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (typeof child === "function") {
      const fragment = document.createDocumentFragment();
      applyReactiveChild(fragment, child);
      result.push(
        ...(Array.from(fragment.childNodes) as Array<HTMLElement | SVGElement | Text | Comment>),
      );
    } else if (Array.isArray(child)) {
      result.push(...flattenChildren(child));
    } else if (child !== null && child !== undefined && child !== false) {
      if (
        child instanceof HTMLElement ||
        child instanceof Text ||
        child instanceof Comment ||
        (typeof SVGElement !== "undefined" && child instanceof SVGElement)
      ) {
        result.push(stageNode(child));
      } else if (typeof child === "string" || typeof child === "number") {
        result.push(document.createTextNode(String(child)));
      }
    }
  }
  return result;
}

/** @internal */
function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
