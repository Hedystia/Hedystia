/** @vitest-environment happy-dom */
/** @jsxImportSource @hedystia/view */
import { jsx, jsxs, mount, renderToString, sig, update, val } from "@hedystia/view";
import type { HTMLElement } from "happy-dom";
import { describe, expect, it } from "vitest";

describe("SSR to hydration handoff", () => {
  it("serializes a host page with escaped text, void elements and nested lists", () => {
    const userComment = "<script>alert('xss')</script>";
    const sections = ["Auroras", "Cascadas"];

    const page = jsx("article", {
      id: "guide",
      children: [
        jsx("h1", { children: "Guía de viaje" }),
        jsx("img", { src: "/aurora.jpg", alt: "Auroras", loading: "lazy" }),
        jsx("input", { type: "checkbox", checked: true, disabled: false }),
        jsx("p", { children: userComment }),
        jsx("ul", {
          children: sections.map((section) => jsx("li", { key: section, children: section })),
        }),
      ],
    });

    const html = renderToString(page);

    expect(html).toContain("<h1>Guía de viaje</h1>");
    expect(html).toContain('src="/aurora.jpg"');
    expect(html).toContain("checked");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<li key="Auroras">Auroras</li>');
    expect(html).toContain('<li key="Cascadas">Cascadas</li>');
  });

  it("keeps attribute hygiene: booleans, numbers, styles and svg shapes", () => {
    const page = jsxs("section", {
      children: [
        jsx("progress", { max: 100, value: 40 }),
        jsx("span", {
          "data-count": 3,
          hidden: true,
          title: 'Paquete "premium"',
          children: "3 paquetes",
        }),
        jsx("div", { style: { background: "#111" }, children: "" }),
        jsx("svg", {
          viewBox: "0 0 24 24",
          width: 24,
          children: jsx("circle", { cx: 12, cy: 12, r: 10 }),
        }),
      ],
    });

    const html = renderToString(page);

    expect(html).toContain('data-count="3"');
    expect(html).toContain("hidden");
    expect(html).toContain('max="100"');
    expect(html).toContain('value="40"');
    expect(html).toContain("Paquete &quot;premium&quot;");
    expect(html).toContain("viewBox");
    expect(html).toContain("<circle");
  });

  it("upgrades server markup into a live island without clobbering the shell", () => {
    document.body.innerHTML = [
      '<div id="shell">',
      '  <header id="site-header">Tienda Zastinian</header>',
      '  <section id="cart-island"></section>',
      '  <footer id="site-footer">© 2026</footer>',
      "</div>",
    ].join("");

    const count = sig(0);
    const total = sig(0);

    function CartIsland() {
      const price = 50;
      return jsxs("div", {
        id: "cart",
        className: "island",
        children: [
          jsx("span", { id: "cart-count", children: () => `Count: ${val(count)}` }),
          jsx("span", { id: "cart-total", children: () => `Total: ${val(total)}` }),
          jsx("button", {
            type: "button",
            id: "cart-add",
            onClick: () => {
              update(count, (c) => c + 1);
              update(total, (t) => t + price);
            },
            children: "Añadir",
          }),
        ],
      });
    }

    const islandHost = document.querySelector("#cart-island") as HTMLElement;
    expect(islandHost.innerHTML).toBe("");

    mount(CartIsland, islandHost);

    expect(document.querySelector("#site-header")?.textContent).toBe("Tienda Zastinian");
    expect(document.querySelector("#site-footer")?.textContent).toBe("© 2026");
    expect((islandHost.firstElementChild as HTMLElement).className).toBe("island");

    (document.querySelector("#cart-add") as HTMLElement).click();
    (document.querySelector("#cart-add") as HTMLElement).click();

    expect(document.querySelector("#cart-count")?.textContent).toBe("Count: 2");
    expect(document.querySelector("#cart-total")?.textContent).toBe("Total: 100");
  });
});
