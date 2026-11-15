/** @vitest-environment happy-dom */
import client from "@hedystia/astro/client.js";
import renderer from "@hedystia/astro/server.js";
import { jsx, onCleanup, set, sig, val } from "@hedystia/view";
import { describe, expect, it, vi } from "vitest";

describe("Astro owner lifecycle", () => {
  it("hydrates server controls and slots in place and preserves a pre-activation draft", () => {
    document.body.innerHTML =
      '<astro-island ssr props="same"><section><input value="server"><button>1</button><astro-slot><astro-island><p>Nested SSR</p></astro-island></astro-slot></section></astro-island>';
    const element = document.querySelector<HTMLElement>("astro-island")!;
    const section = element.querySelector("section");
    const input = element.querySelector("input")!;
    const button = element.querySelector("button")!;
    const slot = element.querySelector("astro-slot");
    const nested = slot?.querySelector("astro-island");
    input.value = "draft";
    input.focus();
    const cleanup = vi.fn();
    const Component = ({ children }: { children: HTMLElement }) => {
      const count = sig(1);
      onCleanup(cleanup);
      return jsx("section", {
        children: [
          jsx("input", { value: "server" }),
          jsx("button", { children: () => val(count), onClick: () => set(count, val(count) + 1) }),
          children,
        ],
      });
    };
    const activate = client(element);
    activate(Component, {}, {}, { client: "load" });
    element.removeAttribute("ssr");
    expect(element.querySelector("section")).toBe(section);
    expect(element.querySelector("input")).toBe(input);
    expect(input.value).toBe("draft");
    expect(document.activeElement).toBe(input);
    expect(element.querySelector("button")).toBe(button);
    expect(element.querySelector("astro-slot")).toBe(slot);
    expect(slot?.querySelector("astro-island")).toBe(nested);
    button.click();
    activate(Component, {}, {}, { client: "load" });
    expect(element.querySelector("button")).toBe(button);
    expect(button.textContent).toBe("2");
    element.dispatchEvent(new Event("astro:unmount"));
    button.click();
    expect(button.textContent).toBe("2");
    expect(cleanup).toHaveBeenCalledOnce();
    element.remove();
  });

  it("does not execute a checked component twice for the same render", async () => {
    const cleanup = vi.fn();
    const Component = vi.fn(() => {
      onCleanup(cleanup);
      return jsx("p", { children: "static" });
    });
    const context = { result: {} } as any;
    const props = {};
    const slots = {};
    const metadata = { astroStaticSlot: true };
    expect(await renderer.check!.call(context, Component, props, slots, metadata)).toBe(true);
    const result = await renderer.renderToStaticMarkup!.call(
      context,
      Component,
      props,
      slots,
      metadata,
    );
    expect(result.html).toBe("<p>static</p>");
    expect(Component).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("keeps persisted state on repeated activation and releases replaced props and removed islands once", () => {
    const element = document.createElement("astro-island");
    element.setAttribute("ssr", "");
    element.setAttribute("props", "one");
    document.body.appendChild(element);
    const cleanup = vi.fn();
    const Component = ({ initial }: { initial: number }) => {
      const count = sig(initial);
      onCleanup(cleanup);
      return jsx("button", {
        onClick: () => set(count, val(count) + 1),
        children: () => val(count),
      });
    };
    const hydrate = client(element);
    hydrate(Component, { initial: 1 }, {}, { client: "load" });
    element.removeAttribute("ssr");
    const button = element.querySelector("button")!;
    button.click();
    hydrate(Component, { initial: 1 }, {}, { client: "load" });
    expect(element.querySelector("button")).toBe(button);
    expect(button.textContent).toBe("2");
    element.setAttribute("props", "two");
    hydrate(Component, { initial: 10 }, {}, { client: "load" });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(element.textContent).toBe("10");
    button.click();
    expect(element.textContent).toBe("10");
    element.dispatchEvent(new Event("astro:unmount"));
    element.dispatchEvent(new Event("astro:unmount"));
    expect(cleanup).toHaveBeenCalledTimes(2);
    element.remove();
  });
});
