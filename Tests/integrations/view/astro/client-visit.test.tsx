/** @vitest-environment happy-dom */
import astroClient from "@hedystia/astro/client.js";
import { jsx, sig, update, val } from "@hedystia/view";
import type { HTMLElement } from "happy-dom";
import { describe, expect, it } from "vitest";

describe("Astro client island visit", () => {
  it("hydrates a visited island, reuses slot nodes and disposes on unmount", () => {
    document.body.innerHTML =
      '<div id="page"><header>shell</header>' +
      '<astro-island id="island" ssr="ssr" component-url="/cart.js" data-view-render-id="v0">' +
      '<astro-slot name="header"><h3>Slot header</h3></astro-slot>' +
      "</astro-island>" +
      "<footer>shell-footer</footer></div>";

    const island = document.querySelector("#island") as HTMLElement;
    const count = sig(5);

    astroClient(island)(
      (props: any) =>
        jsx("div", {
          className: "cart hydrated-island",
          children: [
            jsx("p", { id: "slot-echo", children: props.header?.textContent ?? "sin slot" }),
            jsx("span", { id: "island-count", children: () => `Count: ${val(count)}` }),
            jsx("button", {
              type: "button",
              id: "island-add",
              onClick: () => update(count, (c: number) => c + 1),
              children: "Añadir",
            }),
          ],
        }),
      {},
      { header: "<h3>Slot header</h3>" },
      { client: "after-hydration" },
    );

    expect(document.querySelector("#page header")?.textContent).toBe("shell");
    expect(document.querySelector("#page footer")?.textContent).toBe("shell-footer");
    expect(island.querySelector("#slot-echo")?.textContent).toContain("Slot header");

    (island.querySelector("#island-add") as HTMLElement).click();
    expect(island.querySelector("#island-count")?.textContent).toBe("Count: 6");
    (island.querySelector("#island-add") as HTMLElement).click();
    expect(island.querySelector("#island-count")?.textContent).toBe("Count: 7");

    island.dispatchEvent(new CustomEvent("astro:unmount"));
    expect(island.innerHTML).toBe("");
  });

  it("skips hydration and slot scanning when the island is client-only", () => {
    document.body.innerHTML =
      '<astro-island id="client-only"><astro-slot name="header"><h3>Nombre</h3></astro-slot></astro-island>';

    const island = document.querySelector("#client-only") as HTMLElement;
    const before = island.innerHTML;

    astroClient(island)(
      () => jsx("div", { children: "compacto" }),
      {},
      { header: "<h3>Nombre</h3>" },
      { client: "only" },
    );

    expect(island.innerHTML).toBe(before);
  });

  it("excludes nested islands from slot collection", () => {
    document.body.innerHTML =
      '<astro-island id="outer" ssr="ssr">' +
      '<astro-slot name="header"><h3>Slot header</h3></astro-slot>' +
      "<astro-island>Chispas</astro-island>" +
      "</astro-island>";

    const outer = document.querySelector("#outer") as HTMLElement;
    let seenHeader: string | null = null;

    astroClient(outer)(
      (props: any) => {
        if (props.header) {
          seenHeader = props.header.getAttribute("name") ?? "default";
        }
        return jsx("div", { id: "outer-rendered", children: "listo" });
      },
      {},
      { header: "<h3>Slot header</h3>" },
      { client: "after-hydration" },
    );

    expect(outer.querySelector("#outer-rendered")).not.toBeNull();
    expect(seenHeader).toBe("header");
    expect(outer.innerHTML).toContain("listo");
    expect(outer.innerHTML).not.toContain("Chispas");
  });
});
