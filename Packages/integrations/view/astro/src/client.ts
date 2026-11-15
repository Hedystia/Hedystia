import { hydrate, mount, type ViewApp } from "@hedystia/view";
import { slotName } from "./slots/name";

const mounted = new WeakMap<
  HTMLElement,
  { app: ViewApp; Component: unknown; props: unknown; serialized: string | null }
>();

/** Mount only an activated Astro island and release exactly one owner on removal. */
export default function client(element: HTMLElement) {
  return (
    Component: any,
    props: any,
    slotted: Record<string, string>,
    { client }: { client: string },
  ) => {
    if (!element.hasAttribute("ssr") && client !== "only" && !mounted.has(element)) {
      return;
    }
    const previous = mounted.get(element);
    const serialized = element.getAttribute("props");
    if (
      previous?.Component === Component &&
      (serialized !== null ? serialized === previous.serialized : props === previous.props)
    ) {
      return;
    }
    const slots: Record<string, HTMLElement> = Object.create(null);
    const iterator = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT, (node) => {
      if (node.nodeName === "ASTRO-ISLAND") {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeName === "ASTRO-SLOT" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    });
    for (
      let node = iterator.nextNode() as HTMLElement | null;
      node;
      node = iterator.nextNode() as HTMLElement | null
    ) {
      slots[node.getAttribute("name") || "default"] = node;
    }
    for (const [name, html] of Object.entries(slotted)) {
      const normalized = name === "default" ? "default" : slotName(name);
      if (!slots[normalized]) {
        const slot = document.createElement("astro-slot");
        if (name !== "default") {
          slot.setAttribute("name", normalized);
        }
        slot.innerHTML = html;
        slots[normalized] = slot;
      }
    }
    previous?.app.dispose();
    const { default: children, ...named } = slots;
    const activate = previous || client === "only" ? mount : hydrate;
    const app = activate(() => Component({ ...props, ...named, children }), element);
    mounted.set(element, { app, Component, props, serialized });
    if (!previous) {
      element.addEventListener(
        "astro:unmount",
        () => {
          mounted.get(element)?.app.dispose();
          mounted.delete(element);
        },
        { once: true },
      );
    }
  };
}
