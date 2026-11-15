/** @vitest-environment happy-dom */
import {
  createRoot,
  getOwner,
  jsx,
  mount,
  on,
  onCleanup,
  onMount,
  onReady,
  set,
  sig,
  val,
} from "@hedystia/view";
import { renderToString } from "@hedystia/view/server";
import { describe, expect, it, vi } from "vitest";

describe("reactive ownership and static rendering", () => {
  it("does not rerun queued work after an earlier observer disposes its owner", () => {
    const source = sig(0);
    let disposeChild!: () => void;
    const runs = vi.fn();
    let dispose!: () => void;
    createRoot((stop) => {
      dispose = stop;
      on(
        () => val(source),
        (value) => {
          if (value === 1) {
            disposeChild();
          }
        },
      );
      createRoot((stopChild) => {
        disposeChild = stopChild;
        on(() => val(source), runs);
      });
    });
    expect(runs).toHaveBeenCalledOnce();
    set(source, 1);
    expect(runs).toHaveBeenCalledOnce();
    dispose();
  });

  it("supports reactive component roots without adding wrapper elements", () => {
    const target = document.createElement("div");
    const text = sig("one");
    const app = mount(() => () => jsx("h1", { children: val(text) }), target);
    expect(target.querySelector("h1")?.textContent).toBe("one");
    set(text, "two");
    expect(target.querySelector("h1")?.textContent).toBe("two");
    app.dispose();
  });

  it("disposes all owned work even if a cleanup callback throws", () => {
    const released = vi.fn();
    let dispose!: () => void;
    createRoot((stop) => {
      dispose = stop;
      createRoot(() => {
        onCleanup(released);
      });
      onCleanup(() => {
        throw new Error("cleanup");
      });
    });
    expect(dispose).toThrow("cleanup");
    expect(released).toHaveBeenCalledOnce();
    dispose();
    expect(released).toHaveBeenCalledOnce();
  });

  it("adopts nested roots into their parent and disposes them exactly once", () => {
    const cleanup = vi.fn();
    let dispose!: () => void;
    createRoot((stop) => {
      dispose = stop;
      const parent = getOwner();
      createRoot(() => {
        expect(getOwner()?._owner).toBe(parent);
        onCleanup(cleanup);
      });
      expect(parent?._owned).toHaveLength(1);
    });
    dispose();
    dispose();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans up roots when rendering throws", () => {
    const cleanup = vi.fn();
    expect(() =>
      createRoot(() => {
        onCleanup(cleanup);
        throw new Error("render failed");
      }),
    ).toThrow("render failed");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(getOwner()).toBeNull();
  });

  it("does not run client lifecycle callbacks during SSR even in a browser environment", async () => {
    const client = vi.fn();
    const cleanup = vi.fn();
    expect(
      renderToString(() => {
        onCleanup(cleanup);
        onMount(() => {
          client();
          return undefined;
        });
        onReady(client);
        return jsx("p", { children: "static" });
      }),
    ).toBe("<p>static</p>");
    await Promise.resolve();
    expect(client).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("updates text in place and preserves focus when a reactive child returns the same DOM node", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const count = sig(0);
    const app = mount(() => {
      const input = jsx("input", { value: "typed" }) as HTMLInputElement;
      return jsx("main", {
        children: [
          jsx("span", { children: () => val(count) }),
          jsx("div", {
            children: () => {
              val(count);
              return input;
            },
          }),
        ],
      });
    }, target);
    const text = target.querySelector("span")!.firstChild;
    const input = target.querySelector("input")!;
    input.focus();
    input.value = "user edit";
    set(count, 1);
    expect(target.querySelector("span")!.firstChild).toBe(text);
    expect(text?.textContent).toBe("1");
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("user edit");
    app.dispose();
    target.remove();
  });
});
