import renderer from "@hedystia/astro/server.js";
import { jsx, jsxs, renderToString, sig, update, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

/**
 * A user lands on an Astro page whose islands use (nearly) the whole view
 * surface: signals baked as accessors, styles, classList, SVG maps, slots and
 * hydration ids. The SSR side runs through the production string serializer in
 * a plain node environment (no document), exactly what Astro does per request.
 */

interface SSRResult {
  _metadata: Record<string, unknown>;
}

function ssrResult(): SSRResult {
  return { _metadata: {} };
}

function hydratedCall(
  pageResult: SSRResult,
  component: any,
  props: any,
  slots: any,
  metadata: any,
) {
  return (renderer as any).renderToStaticMarkup.call(
    { result: pageResult },
    component,
    props,
    slots,
    metadata,
  );
}

function CartIsland({ initialCount = 0 }: { initialCount?: number }) {
  const count = sig(initialCount);

  return jsxs("section", {
    className: "cart island",
    children: [
      jsx("h2", { children: "Carrito" }),
      jsx("span", { id: "cart-count", children: () => `Count: ${val(count)}` }),
      jsx("button", {
        type: "button",
        class: "cart-add",
        onClick: () => update(count, (c) => c + 1),
        children: "Añadir",
      }),
    ],
  });
}

function ProfileIsland({ user }: { user: { name: string; role: string } }) {
  return jsxs("div", {
    className: "profile island",
    classList: { admin: user.role === "admin" },
    children: [
      jsx("span", { "data-role": user.role, children: user.name }),
      jsx("svg", {
        viewBox: "0 0 24 24",
        width: 24,
        children: jsx("circle", { cx: 12, cy: 12, r: 10 }),
      }),
      jsx("img", { src: "/avatar.png", alt: `Avatar de ${user.name}` }),
      jsx("progress", { max: 100, value: 75 }),
      jsx("div", { style: { borderColor: "#ff6600", paddingLeft: "4px" } }),
    ],
  });
}

function HeroArticle({
  children,
  heroTitle,
  mainText,
}: {
  children?: any;
  heroTitle?: any;
  mainText?: any;
}) {
  return jsxs("article", {
    className: "hero",
    children: [
      jsx("h1", { children: heroTitle }),
      jsx("div", { className: "hero-main", children: mainText }),
      jsx("div", { className: "hero-extra", children }),
    ],
  });
}

describe("Astro page visit journey (renderer)", () => {
  it("renders a full editorial page through renderToStaticMarkup", async () => {
    const { html, attrs } = await hydratedCall(
      ssrResult(),
      HeroArticle,
      {},
      {
        default: "<p>slot-footer-content</p>",
        "hero-title": "<em>Título desde slot</em><script>no</script>",
        "main-text": "<b>texto principal</b>",
      },
      { hydrate: false, astroStaticSlot: true },
    );

    expect(html).toContain('<article class="hero"');
    expect(html).toContain("Título desde slot");
    expect(html).toContain("texto principal");
    expect(html).toContain("slot-footer-content");
    // Slot markup arrives as props and is escaped by the serializer
    expect(html).toContain("astro-static-slot");
    expect(html).not.toContain("<script>no</script>");
    expect(html).not.toContain("<astro-slot>");
    // No hydration requested: no render id
    expect(attrs["data-view-render-id"]).toBe("");
  });

  it("marks hydration ids strictly first-come among three islands of one page", async () => {
    const page = ssrResult();

    const first = await hydratedCall(page, CartIsland, { initialCount: 0 }, {}, { hydrate: true });
    const second = await hydratedCall(page, CartIsland, { initialCount: 3 }, {}, { hydrate: true });
    const third = await hydratedCall(
      page,
      ProfileIsland,
      { user: { name: "Zastinian", role: "admin" } },
      {},
      { hydrate: true },
    );

    expect(first.attrs["data-view-render-id"]).toBe("v0");
    expect(second.attrs["data-view-render-id"]).toBe("v1");
    expect(third.attrs["data-view-render-id"]).toBe("v2");

    expect(first.html).toContain("Count: 0");
    expect(second.html).toContain("Count: 3");
    expect(third.html).toContain('data-role="admin"');
    expect(third.html).toContain('class="profile island admin"');
    expect(third.html).toContain("Zastinian");
    expect(third.html).toContain('<circle cx="12" cy="12" r="10"></circle>');
    expect(third.html).toContain('src="/avatar.png"');
    expect(third.html).toContain('<progress max="100" value="75"></progress>');
    expect(third.html).toContain("borderColor:#ff6600");
  });

  it("of a fresh page, hydration ids restart", async () => {
    const { attrs, html } = await hydratedCall(
      ssrResult(),
      HeroArticle,
      {},
      { "hero-title": "<time>noticia fresca</time>" },
      { hydrate: true },
    );

    expect(attrs["data-view-render-id"]).toBe("v0");
    expect(html).toContain("&lt;astro-slot name=&quot;heroTitle&quot;&gt;");
    expect(html).toContain("noticia fresca");
    expect(html).not.toContain("astro-static-slot");
  });

  it("rejects foreign component shapes without rendering them", async () => {
    expect(await (renderer as any).check!.call({ result: ssrResult() }, CartIsland, {}, {})).toBe(
      true,
    );
    expect(
      await (renderer as any).check!.call({ result: ssrResult() }, "string-component", {}, {}),
    ).toBe(false);

    const qwik = function QwikComponent() {};
    expect(await (renderer as any).check!.call({ result: ssrResult() }, qwik, {}, {})).toBe(false);

    const payloadComp = Object.assign(() => jsx("div", { children: "payload" }), {
      toString: () => "function component($$payload) {}",
    });
    expect(await (renderer as any).check!.call({ result: ssrResult() }, payloadComp, {}, {})).toBe(
      false,
    );
  });

  it("serializes a static page built entirely in node", () => {
    const html = renderToString(
      jsxs("main", {
        children: [
          jsx("h1", { children: "Bienvenido a la portada" }),
          jsx("p", { children: "Texto <peligroso> & pruebas" }),
          jsx("div", {
            classList: { visible: true, hidden: false },
            className: "base",
            children: "",
          }),
          jsx("span", { class: ["tag", "fresh"], children: "etiqueta" }),
          jsx("input", { type: "checkbox", checked: true, disabled: false }),
          jsx("progress", { max: 100, value: 40 }),
        ],
      }),
    );

    expect(html).toContain("Bienvenido a la portada");
    expect(html).toContain("Texto &lt;peligroso&gt; &amp; pruebas");
    expect(html).toContain('<div class="visible base">');
    expect(html).toContain('class="tag fresh"');
    expect(html).toContain('<input type="checkbox" checked>');
    expect(html).not.toContain("disabled");
    expect(html).toContain('<progress max="100" value="40"></progress>');
  });
});
