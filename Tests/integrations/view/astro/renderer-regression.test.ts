/** @vitest-environment happy-dom */
import astroClient from "@hedystia/astro/client.js";
import renderer from "@hedystia/astro/server.js";
import { jsx } from "@hedystia/view";
import { describe, expect, it } from "vitest";

function result() {
  return {} as any;
}

describe("Astro renderer integration contracts", () => {
  it("accepts components that intentionally render nothing", async () => {
    expect(await renderer.check!.call({ result: result() }, () => null, {}, {})).toBe(true);
    expect(await renderer.check!.call({ result: result() }, () => "", {}, {})).toBe(true);
  });

  it("escapes a slot name used inside an HTML attribute", async () => {
    const name = 'hero" data-injected="yes';
    const rendered = await renderer.renderToStaticMarkup!.call(
      { result: result() },
      (props: any) =>
        jsx("section", {
          children:
            props[
              name.replace(/[-_]([a-z])/g, (_match: string, letter: string) => letter.toUpperCase())
            ],
        }),
      {},
      { [name]: "content" },
    );
    expect(rendered.html).toContain("&quot;");
    const container = document.createElement("div");
    container.innerHTML = rendered.html;
    expect(container.querySelector("[data-injected]")).toBeNull();
    expect(container.querySelector("astro-slot")?.getAttribute("name")).toBe(
      name.replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase()),
    );
  });

  it("accepts view components and rejects incompatible component shapes", async () => {
    const Component = ({ children, title }: any) => jsx("section", { title, children });
    expect(await renderer.check!.call({ result: result() }, Component, { title: "ok" }, {})).toBe(
      true,
    );
    expect(await renderer.check!.call({ result: result() }, "not-a-component", {}, {})).toBe(false);
    expect(
      await renderer.check!.call({ result: result() }, () => ({ unsupported: true }), {}, {}),
    ).toBe(false);
    const incompatible = Object.assign(() => jsx("div", { children: "no" }), {
      toString: () => "function component($$payload) {}",
    });
    expect(await renderer.check!.call({ result: result() }, incompatible, {}, {})).toBe(false);
  });

  it("renders default and named Astro slots with stable hydration IDs", async () => {
    const Component = ({ children, header, heroSlot }: any) =>
      jsx("article", {
        children: [jsx("h1", { children: header }), heroSlot, children] as any,
      });
    const context = { result: result() } as any;

    const first = await renderer.renderToStaticMarkup!.call(
      context,
      Component,
      { header: "Title" },
      { default: "body", hero_slot: "hero" },
      { hydrate: "load" } as any,
    );
    const second = await renderer.renderToStaticMarkup!.call(
      context,
      Component,
      { header: "Title" },
      { default: "body-2" },
      { hydrate: "load" } as any,
    );

    const firstId = first.attrs?.["data-view-render-id"] as string;
    const secondId = second.attrs?.["data-view-render-id"] as string;
    expect(firstId).toMatch(/^v\d+$/);
    expect(secondId).toMatch(/^v\d+$/);
    expect(Number(secondId.slice(1))).toBe(Number(firstId.slice(1)) + 1);
    expect(first.html).toContain("hero");
    expect(first.html).toContain("body");
    expect(second.html).toContain("body-2");
  });

  it("uses static slot tags when hydration is disabled", async () => {
    const Component = ({ children }: any) => jsx("div", { children });
    const rendered = await renderer.renderToStaticMarkup!.call(
      { result: result() },
      Component,
      {},
      { default: "static" },
      { astroStaticSlot: true } as any,
    );
    expect(rendered.attrs?.["data-view-render-id"]).toBe("");
    expect(rendered.html).toContain("astro-static-slot");
  });

  it("does not hydrate islands that are not marked for SSR", () => {
    const element = document.createElement("astro-island");
    document.body.appendChild(element);
    const component = () => jsx("button", { children: "hydrated" });

    expect(() => astroClient(element)(component, {}, {}, { client: "load" })).not.toThrow();
    expect(element.innerHTML).toBe("");
    element.remove();
  });
});
