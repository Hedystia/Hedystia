/** @vitest-environment happy-dom */
import { createLayout, createRoute, createRouter } from "@hedystia/router";
import { jsx, onCleanup, set, sig, val } from "@hedystia/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dispose: (() => void) | undefined;
beforeEach(() => {
  window.history.replaceState({}, "", "http://localhost:3000/");
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});

describe("browser route ownership", () => {
  it("clears busy state when navigation is aborted or the router stops", async () => {
    let started!: () => void;
    let finish!: (value: string) => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const work = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const router = createRouter({
      window,
      routes: [
        createRoute("/", { component: () => jsx("h1", { children: "Home" }) }),
        createRoute("/slow", {
          loader: () => {
            started();
            return work;
          },
        }),
      ],
    });
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = router.mount(root);
    dispose = app.dispose;
    await router.load("/");
    const controller = new AbortController();
    const pending = router.navigate({ to: "/slow", signal: controller.signal });
    await ready;
    expect(root.getAttribute("aria-busy")).toBe("true");
    controller.abort();
    await pending;
    expect(root.getAttribute("aria-busy")).toBe("false");
    expect(root.textContent).toBe("Home");
    const stopped = router.navigate({ to: "/slow" });
    expect(root.getAttribute("aria-busy")).toBe("true");
    router.stop();
    finish("late");
    await stopped;
    expect(root.getAttribute("aria-busy")).toBe("false");
    expect(router.state().status).toBe("success");
    expect(root.textContent).toBe("Home");
  });

  it("preserves a shared layout and reactive state while child routes and loader data change", async () => {
    const cleanup = vi.fn();
    let layoutRuns = 0;
    const user = createRoute("/users/$id", {
      loader: ({ params }) => ({ id: params.id }),
      component: ({ data }) => jsx("h1", { children: () => `User ${data().id}` }),
    });
    const root = createLayout("root", {
      component: ({ outlet }) => {
        layoutRuns++;
        onCleanup(cleanup);
        const count = sig(0);
        return jsx("main", {
          children: [
            jsx("button", {
              id: "count",
              onClick: () => set(count, val(count) + 1),
              children: () => val(count),
            }),
            jsx("section", { children: outlet }),
          ],
        });
      },
    }).addChildren([
      user,
      createRoute("/other", { component: () => jsx("h1", { children: "Other" }) }),
    ]);
    const router = createRouter({ routes: [root], window });
    const app = router.mount(document.querySelector<HTMLElement>("#app")!);
    dispose = app.dispose;
    await router.navigate({ to: "/users/$id", params: { id: 1 } });
    const button = document.querySelector<HTMLButtonElement>("#count")!;
    button.click();
    expect(button.textContent).toBe("1");
    await router.navigate({ to: "/users/$id", params: { id: 2 } });
    expect(document.querySelector("h1")?.textContent).toBe("User 2");
    await router.navigate({ to: "/other" });
    expect(document.querySelector("h1")?.textContent).toBe("Other");
    expect(document.querySelector("#count")).toBe(button);
    button.click();
    expect(button.textContent).toBe("2");
    expect(layoutRuns).toBe(1);
    expect(document.activeElement).toBe(document.querySelector("h1"));
    app.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("owns only normal internal clicks within its mounted root and handles popstate restoration", async () => {
    const router = createRouter({
      window,
      routes: [
        createRoute("/", { component: () => jsx("a", { href: "/next", children: "Next" }) }),
        createRoute("/next", { component: () => jsx("h1", { children: "Next" }) }),
      ],
    });
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = router.mount(root);
    dispose = app.dispose;
    await router.load("/");
    const anchor = root.querySelector("a")!;
    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    anchor.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    const normal = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(normal);
    expect(normal.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(router.state().location.pathname).toBe("/next"));
    window.history.replaceState({}, "", "/");
    const scroll = vi.spyOn(window, "scrollTo");
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { __hedystiaRouter: { x: 10, y: 20 } } }),
    );
    await vi.waitFor(() => expect(router.state().location.pathname).toBe("/"));
    expect(scroll).toHaveBeenCalledWith(10, 20);
    const outside = document.createElement("a");
    outside.href = "/next";
    document.body.appendChild(outside);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    outside.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it("uses optional native View Transitions and honors reduced-motion preferences", async () => {
    const start = vi.fn((update: () => void) => {
      update();
      return { updateCallbackDone: Promise.resolve(), finished: Promise.resolve() };
    });
    Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
    const media = vi
      .spyOn(window, "matchMedia")
      .mockReturnValue({ matches: false } as MediaQueryList);
    const router = createRouter({
      window,
      viewTransitions: true,
      routes: [createRoute("/"), createRoute("/next")],
    });
    await router.navigate({ to: "/next" });
    expect(start).toHaveBeenCalledOnce();
    media.mockReturnValue({ matches: true } as MediaQueryList);
    await router.navigate({ to: "/" });
    expect(start).toHaveBeenCalledOnce();
    delete (document as any).startViewTransition;
  });

  it("preloads on intent and cleans up queued intent when its link is removed", async () => {
    const loader = vi.fn(async () => "data");
    const router = createRouter({
      window,
      routes: [
        createRoute("/", { component: () => router.Link({ to: "/next", children: "Next" }) }),
        createRoute("/next", { loader }),
      ],
    });
    const app = router.mount(document.querySelector<HTMLElement>("#app")!);
    dispose = app.dispose;
    await router.load("/");
    const anchor = document.querySelector("a")!;
    anchor.dispatchEvent(new MouseEvent("mouseenter"));
    anchor.dispatchEvent(new MouseEvent("mouseleave"));
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(loader).not.toHaveBeenCalled();
    anchor.dispatchEvent(new FocusEvent("focus"));
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    await router.navigate({ to: "/next" });
    expect(loader).toHaveBeenCalledOnce();
  });
});
