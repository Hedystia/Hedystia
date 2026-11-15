import { renderToString } from "@hedystia/view/server";
import type { NamedSSRLoadedRendererValue } from "astro";
import { getContext, incrementId } from "./context";
import { serverSlots } from "./slots/server";
import type { RendererContext } from "./types";

/** Render once per checked component and props inside a disposable SSR owner. */
function render(
  this: RendererContext,
  Component: any,
  props: Record<string, any>,
  children: Record<string, string>,
  metadata?: Record<string, any>,
) {
  const mode = metadata?.astroStaticSlot ? !!metadata.hydrate : true;
  const context = getContext(this.result);
  const cached = context.rendered.get(Component);
  if (cached && cached.props === props && cached.children === children && cached.mode === mode) {
    return cached.html;
  }
  const html = renderToString(() => Component({ ...props, ...serverSlots(children, mode) }));
  context.rendered.set(Component, { props, children, mode, html });
  return html;
}

/** Check View components without leaking reactive owners or rendering accepted output twice. */
async function check(
  this: RendererContext,
  Component: any,
  props: Record<string, any>,
  children: Record<string, string>,
  metadata?: Record<string, any>,
) {
  if (
    typeof Component !== "function" ||
    Component.name === "QwikComponent" ||
    Component.toString().includes("$$payload")
  ) {
    return false;
  }
  try {
    let result: unknown;
    const mode = metadata?.astroStaticSlot ? !!metadata.hydrate : true;
    const html = renderToString(() => {
      result = Component({ ...props, ...serverSlots(children, mode) });
      return result;
    });
    const valid = html.length > 0 || result == null || result === "" || typeof result === "boolean";
    if (valid) {
      getContext(this.result).rendered.set(Component, { props, children, mode, html });
    }
    return valid;
  } catch {
    return false;
  }
}

/** Return static HTML; client code is selected exclusively by Astro client directives. */
async function renderToStaticMarkup(
  this: RendererContext,
  Component: any,
  props: Record<string, any>,
  children: Record<string, string>,
  metadata?: Record<string, any>,
) {
  const html = render.call(this, Component, props, children, metadata);
  getContext(this.result).rendered.delete(Component);
  return {
    attrs: { "data-view-render-id": metadata?.hydrate ? incrementId(getContext(this.result)) : "" },
    html,
  };
}

const renderer: NamedSSRLoadedRendererValue = {
  name: "@hedystia/astro",
  check,
  renderToStaticMarkup,
  supportsAstroStaticSlot: true,
};
export default renderer;
