/** @vitest-environment happy-dom */
import { jsx, onCleanup, set, sig, val } from "@hedystia/view";
import { hydrateIslands } from "@hedystia/view/islands";
import { afterEach, describe, expect, it, vi } from "vitest";

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("explicit island activation", () => {
  it("loads only declared modules and cleans their reactive owners on removal", async () => {
    document.body.innerHTML =
      '<header id="shell">Static</header><hedystia-island data-view-src="counter" data-view-props=\'{"initial":2}\'><button>Count: 2</button></hedystia-island>';
    const cleanup = vi.fn();
    const unused = vi.fn();
    const counter = vi.fn(async () => ({
      default: ({ initial }: { initial: number }) => {
        const count = sig(initial);
        onCleanup(cleanup);
        return jsx("button", {
          onClick: () => set(count, val(count) + 1),
          children: () => `Count: ${val(count)}`,
        });
      },
    }));
    const header = document.querySelector("header");
    const button = document.querySelector("button");
    stop = hydrateIslands({ counter, unused });
    await vi.waitFor(() =>
      expect(document.querySelector("hedystia-island")?.hasAttribute("data-view-active")).toBe(
        true,
      ),
    );
    document.querySelector("button")!.click();
    expect(document.querySelector("button")).toBe(button);
    expect(document.querySelector("button")!.textContent).toBe("Count: 3");
    expect(document.querySelector("header")).toBe(header);
    expect(unused).not.toHaveBeenCalled();
    document.querySelector("hedystia-island")!.remove();
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
    stop();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("defers visible islands and prevents a late import from mounting a removed boundary", async () => {
    document.body.innerHTML =
      '<hedystia-island data-view-src="counter" data-view-when="visible"><p>Server HTML</p></hedystia-island>';
    let notify!: (entries: IntersectionObserverEntry[]) => void;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof notify) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    let resolve!: (module: { default: () => string }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ default: () => string }>((done) => {
          resolve = done;
        }),
    );
    stop = hydrateIslands({ counter: loader });
    expect(loader).not.toHaveBeenCalled();
    notify([{ isIntersecting: true }] as IntersectionObserverEntry[]);
    notify([{ isIntersecting: true }] as IntersectionObserverEntry[]);
    expect(loader).toHaveBeenCalledOnce();
    const element = document.querySelector("hedystia-island")!;
    element.remove();
    await Promise.resolve();
    resolve({ default: () => "client" });
    await Promise.resolve();
    expect(element.textContent).toBe("Server HTML");
    expect(disconnect).toHaveBeenCalled();
  });

  it("preserves a draft typed before delayed activation and connects events to that input", async () => {
    document.body.innerHTML =
      '<hedystia-island data-view-src="form"><input value="server"></hedystia-island>';
    const input = document.querySelector("input")!;
    input.value = "my draft";
    input.focus();
    const changed = vi.fn();
    stop = hydrateIslands({
      form: async () => ({
        default: () =>
          jsx("input", {
            value: "server",
            onInput: changed,
          }),
      }),
    });
    await vi.waitFor(() =>
      expect(document.querySelector("hedystia-island")?.hasAttribute("data-view-active")).toBe(
        true,
      ),
    );
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe("my draft");
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new Event("input"));
    expect(changed).toHaveBeenCalledOnce();
  });

  it("waits for idle activation and cancels queued work when stopped", async () => {
    document.body.innerHTML =
      '<hedystia-island data-view-src="idle" data-view-when="idle"><p>SSR</p></hedystia-island>';
    let activate!: () => void;
    const cancel = vi.fn();
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback) => {
        activate = callback;
        return 7;
      }),
    );
    vi.stubGlobal("cancelIdleCallback", cancel);
    const loader = vi.fn(async () => ({ default: () => jsx("p", { children: "SSR" }) }));
    stop = hydrateIslands({ idle: loader });
    expect(loader).not.toHaveBeenCalled();
    stop();
    activate();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledWith(7);
    expect(loader).not.toHaveBeenCalled();
    expect(document.querySelector("p")?.textContent).toBe("SSR");
  });

  it("activates media islands once and releases media listeners", async () => {
    document.body.innerHTML =
      '<hedystia-island data-view-src="media" data-view-when="media:(min-width: 800px)"><p>SSR</p></hedystia-island>';
    let change!: () => void;
    const remove = vi.fn();
    const query = {
      matches: false,
      addEventListener: vi.fn((_event, callback) => {
        change = callback;
      }),
      removeEventListener: remove,
    };
    vi.spyOn(window, "matchMedia").mockReturnValue(query as unknown as MediaQueryList);
    const loader = vi.fn(async () => ({ default: () => jsx("p", { children: "SSR" }) }));
    const paragraph = document.querySelector("p");
    stop = hydrateIslands({ media: loader });
    expect(loader).not.toHaveBeenCalled();
    query.matches = true;
    change();
    change();
    await vi.waitFor(() =>
      expect(document.querySelector("hedystia-island")?.hasAttribute("data-view-active")).toBe(
        true,
      ),
    );
    expect(loader).toHaveBeenCalledOnce();
    expect(document.querySelector("p")).toBe(paragraph);
    expect(remove).toHaveBeenCalledExactlyOnceWith("change", change);
  });

  it("reports import and preparation errors while preserving SSR and releasing partial owners", async () => {
    document.body.innerHTML =
      '<hedystia-island data-view-src="broken"><p>SSR</p></hedystia-island>';
    const boundary = document.querySelector("hedystia-island")!;
    const paragraph = boundary.querySelector("p");
    const errors = vi.fn();
    const cleanup = vi.fn();
    boundary.addEventListener("view:island-error", errors);
    stop = hydrateIslands({
      broken: async () => ({
        default: () => {
          onCleanup(cleanup);
          throw new Error("broken");
        },
      }),
    });
    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
    expect(cleanup).toHaveBeenCalledOnce();
    expect(boundary.querySelector("p")).toBe(paragraph);
    expect(boundary.hasAttribute("data-view-active")).toBe(false);
    stop();
    stop = hydrateIslands({
      broken: async () => {
        throw new Error("import failed");
      },
    });
    await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(2));
    expect(boundary.querySelector("p")).toBe(paragraph);
  });

  it("owns a scoped root itself and disposes it when its container leaves the document", async () => {
    document.body.innerHTML =
      '<section><hedystia-island data-view-src="scoped"><p>SSR</p></hedystia-island></section>';
    const element = document.querySelector<HTMLElement>("hedystia-island")!;
    const cleanup = vi.fn();
    stop = hydrateIslands(
      {
        scoped: async () => ({
          default: () => {
            onCleanup(cleanup);
            return jsx("p", { children: "SSR" });
          },
        }),
      },
      element,
    );
    await vi.waitFor(() => expect(element.hasAttribute("data-view-active")).toBe(true));
    document.querySelector("section")!.remove();
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
    expect(element.hasAttribute("data-view-active")).toBe(false);
  });

  it("releases every island even when one cleanup throws", async () => {
    document.body.innerHTML =
      '<hedystia-island data-view-src="one"></hedystia-island><hedystia-island data-view-src="two"></hedystia-island>';
    const cleanup = vi.fn();
    stop = hydrateIslands({
      one: async () => ({
        default: () => {
          onCleanup(() => {
            throw new Error("cleanup");
          });
          return "one";
        },
      }),
      two: async () => ({
        default: () => {
          onCleanup(cleanup);
          return "two";
        },
      }),
    });
    await vi.waitFor(() => expect(document.querySelectorAll("[data-view-active]")).toHaveLength(2));
    expect(stop).toThrow("Island cleanup failed");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(document.querySelectorAll("[data-view-active]")).toHaveLength(0);
    expect(stop).not.toThrow();
  });
});
