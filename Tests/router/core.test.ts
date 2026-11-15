import {
  createLayout,
  createRoute,
  createRouter,
  lazyRoute,
  notFound,
  redirect,
} from "@hedystia/router";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

/** Create controllable async loader work. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe("typed route loading", () => {
  it("restores committed state after cancellation and can navigate again", async () => {
    const started = deferred<void>();
    const work = deferred<string>();
    const router = createRouter({
      routes: [
        createRoute("/", { loader: () => "home" }),
        createRoute("/slow", {
          loader: () => {
            started.resolve();
            return work.promise;
          },
        }),
      ],
    });
    const committed = await router.load("/");
    const controller = new AbortController();
    const pending = router.navigate({ to: "/slow", signal: controller.signal });
    await started.promise;
    controller.abort();
    expect(router.state()).toBe(committed);
    expect(await pending).toBe(committed);
    work.resolve("late");
    expect((await router.navigate({ to: "/" })).status).toBe("success");
    expect(router.state().location.pathname).toBe("/");
  });

  it("rejects invalid destinations without cancelling valid work", async () => {
    const started = deferred<void>();
    const work = deferred<string>();
    const router = createRouter({
      routes: [
        createRoute("/slow", {
          loader: () => {
            started.resolve();
            return work.promise;
          },
        }),
      ],
    });
    const pending = router.load("/slow");
    await started.promise;
    await expect(router.load("https://external.test/")).rejects.toThrow("origin");
    work.resolve("loaded");
    expect((await pending).status).toBe("success");
    expect(router.match("/slow")?.data).toBe("loaded");
  });

  it("validates search, decodes params and infers loader data", async () => {
    const user = createRoute("/users/$id", {
      validateSearch: (raw) => {
        const page = Number(raw.page ?? 1);
        if (!Number.isInteger(page) || page < 1) {
          throw new Error("Invalid page");
        }
        return { page };
      },
      loader: async ({ params, search }) => ({ id: params.id, page: search.page }),
      component: ({ data, params, search }) => {
        expectTypeOf(data()).toEqualTypeOf<{ id: string; page: number }>();
        expectTypeOf(params()).toEqualTypeOf<{ id: string }>();
        expectTypeOf(search()).toEqualTypeOf<{ page: number }>();
        return data().id;
      },
    });
    const router = createRouter({ routes: [user], initialUrl: "https://app.test/" });
    expect(router.href({ to: "/users/$id", params: { id: "a/b?x" }, search: { page: 2 } })).toBe(
      "/users/a%2Fb%3Fx?page=2",
    );
    expect((await router.load("/users/a%2Fb?page=3")).status).toBe("success");
    expect(router.match("/users/$id")?.data).toEqual({ id: "a/b", page: 3 });
    expectTypeOf(router.match("/users/$id")?.data).toEqualTypeOf<
      { id: string; page: number } | undefined
    >();
    expect((await router.load("/users/a?page=no")).status).toBe("error");
  });

  it("ranks literal routes, nests pathless layouts and supports splats and index routes", async () => {
    const root = createLayout("root").addChildren([
      createRoute("/users").addChildren([
        createRoute("/users/", { loader: () => "index" }),
        createRoute("/users/new", { loader: () => "new" }),
        createRoute("/users/$id", { loader: ({ params }) => params.id }),
      ]),
      createRoute("/files/$", { loader: ({ params }) => params._splat }),
    ]);
    const router = createRouter({ routes: [root] });
    expect((await router.load("/users/new")).matches.map((match) => match.id)).toEqual([
      "root",
      "/users",
      "/users/new",
    ]);
    expect((await router.load("/users/")).matches.at(-1)?.data).toBe("index");
    expect((await router.load("/files/a/b%20c")).matches.at(-1)?.data).toBe("a/b c");
    expect((await router.load("/missing")).status).toBe("not-found");
  });

  it("runs guards before parallel loaders and distinguishes redirects and missing data", async () => {
    const order: string[] = [];
    const gate = deferred<void>();
    const root = createLayout("root", {
      beforeLoad: () => {
        order.push("root guard");
      },
    }).addChildren([
      createRoute("/private", {
        beforeLoad: () => {
          throw redirect("/login");
        },
        loader: () => {
          throw new Error("must not run");
        },
      }),
      createRoute("/login", { loader: () => "login" }),
      createRoute("/data", {
        loader: () => {
          throw notFound();
        },
      }),
      createRoute("/parent", {
        loader: async () => {
          order.push("parent loader");
          await gate.promise;
          return 1;
        },
      }).addChildren([
        createRoute("/parent/child", {
          beforeLoad: () => {
            order.push("child guard");
          },
          loader: () => {
            order.push("child loader");
            gate.resolve();
            return 2;
          },
        }),
      ]),
    ]);
    const router = createRouter({ routes: [root] });
    const redirected = await router.load("/private");
    expect(redirected.location.pathname).toBe("/login");
    expect(redirected.status).toBe("success");
    expect((await router.load("/data")).status).toBe("not-found");
    order.length = 0;
    await router.load("/parent/child");
    expect(order).toEqual(["root guard", "child guard", "parent loader", "child loader"]);
  });

  it("rejects external redirects, invalid route trees and unsafe path segments", async () => {
    const route = createRoute("/users/$id");
    const router = createRouter({ routes: [route] });
    for (const id of ["", ".", ".."]) {
      expect(() => router.href({ to: "/users/$id", params: { id } })).toThrow();
    }
    await expect(router.load("https://external.test/")).rejects.toThrow("origin");
    expect(() => createRouter({ routes: [route, route] })).toThrow("Duplicate");
    expect(() => createRouter({ routes: [createRoute("/files/$/bad")] })).toThrow("splat");
    const external = createRouter({
      routes: [
        createRoute("/", {
          beforeLoad: () => {
            throw redirect("https://external.test/");
          },
        }),
      ],
    });
    expect((await external.load()).status).toBe("error");
  });

  it("loads split definitions and split components only once", async () => {
    const component = vi.fn(async () => ({ default: () => "ready" }));
    const module = vi.fn(async () => ({
      Route: createRoute("/lazy", { loader: () => 1, lazy: component }),
    }));
    const router = createRouter({ routes: [lazyRoute("/lazy", module)] });
    await router.load("/lazy");
    await router.load("/lazy");
    expect(module).toHaveBeenCalledOnce();
    expect(component).toHaveBeenCalledOnce();
  });
});

describe("loader ownership and caching", () => {
  it("never commits stale navigation and does not abort a loader still owned by preloading", async () => {
    const slow = deferred<string>();
    let shared!: AbortSignal;
    const loader = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      shared = signal;
      return slow.promise;
    });
    const route = createRoute("/slow", { loader });
    const router = createRouter({
      routes: [route, createRoute("/fast", { loader: () => "fast" })],
    });
    const preload = router.preload({ to: "/slow" });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    const abandoned = router.navigate({ to: "/slow" });
    await Promise.resolve();
    await router.navigate({ to: "/fast" });
    expect(shared.aborted).toBe(false);
    slow.resolve("slow");
    await Promise.all([preload, abandoned]);
    expect(router.state().location.pathname).toBe("/fast");
    await router.navigate({ to: "/slow" });
    expect(loader).toHaveBeenCalledOnce();
  });

  it("honors preload freshness, stale-time revalidation, dependencies and explicit invalidation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const loader = vi.fn(
      async ({ search }: { search: { page: number; tab: string } }) => search.page,
    );
    const route = createRoute("/users", {
      validateSearch: (raw) => ({ page: Number(raw.page ?? 1), tab: String(raw.tab ?? "all") }),
      loaderDeps: (search) => ({ page: search.page }),
      loader,
      staleTime: 100,
    });
    const router = createRouter({ routes: [route] });
    await router.preload({ to: "/users" });
    await router.navigate({ to: "/users" });
    expect(loader).toHaveBeenCalledOnce();
    await router.navigate({ to: "/users", search: { tab: "active" } });
    expect(loader).toHaveBeenCalledOnce();
    vi.setSystemTime(1100);
    await router.navigate({ to: "/users" });
    expect(loader).toHaveBeenCalledTimes(2);
    await router.navigate({ to: "/users", search: { page: 2 } });
    expect(loader).toHaveBeenCalledTimes(3);
    await router.invalidate();
    expect(loader).toHaveBeenCalledTimes(4);
  });
});
