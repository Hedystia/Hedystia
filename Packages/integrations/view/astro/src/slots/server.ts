import { rawHTML, renderToString } from "@hedystia/view/server";
import { jsx } from "@hedystia/view/static/jsx-runtime";
import { slotName } from "./name";

/** Preserve Astro-rendered trusted slot markup instead of escaping it as user text. */
export function serverSlots(slotted: Record<string, string>, hydrate: boolean) {
  const props: Record<string, unknown> = {};
  for (const [name, html] of Object.entries(slotted)) {
    const normalized = name === "default" ? "children" : slotName(name);
    const slot = jsx(hydrate ? "astro-slot" : "astro-static-slot", {
      name: name === "default" ? undefined : slotName(name),
      children: rawHTML(html),
    });
    Object.defineProperty(props, normalized, {
      value: rawHTML(renderToString(slot)),
      enumerable: true,
    });
  }
  return props;
}
