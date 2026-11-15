import { createQueryClient, hashQueryKey, type QueryKey } from "@hedystia/query";
import { mount as mountView, set, sig } from "@hedystia/view";
import { createLink, RouterView } from "../view/components";
import { buildPath, matchPath, matchRoutes, readSearch } from "./path";
import { NotFound, Redirect } from "./route";
import type {
  Match,
  Navigation,
  RouteNode,
  RoutePaths,
  Router,
  RouterOptions,
  RouterState,
} from "./types";

/** Create a typed router with isolated loader caching, SSR loading and optional browser ownership. */
export function createRouter<const R extends readonly RouteNode[]>(
  options: RouterOptions<R>,
): Router<R> {
  const browser = options.window ?? (typeof window === "undefined" ? undefined : window);
  const initial = new URL(
    options.initialUrl ??
      (browser?.location.protocol.startsWith("http") ? browser.location.href : "http://localhost/"),
  );
  const basepath = `/${(options.basepath ?? "/").split("/").filter(Boolean).join("/")}`.replace(
    /\/$/,
    "",
  );
  if (
    /[?#\\]|%2f/i.test(basepath) ||
    basepath.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new TypeError("Invalid router basepath");
  }
  const definitions = new Map<string, RouteNode>();
  const ids = new Set<string>();
  const resolvedIds = new Map<string, unknown>();
  const validate = (routes: readonly RouteNode[], ancestors = new Set<RouteNode>()) => {
    for (const route of routes) {
      if (ancestors.has(route) || ids.has(route.id)) {
        throw new TypeError(`Duplicate or cyclic route: ${route.id}`);
      }
      ids.add(route.id);
      if (!route._load) {
        resolvedIds.set(route.id, route);
      }
      if (route.path !== null) {
        if (definitions.has(route.path)) {
          throw new TypeError(`Duplicate route path: ${route.path}`);
        }
        definitions.set(route.path, route);
        const parts = route.path.split("/").filter(Boolean);
        if (
          parts.some((part, index) => (part === "$" || part === "*") && index !== parts.length - 1)
        ) {
          throw new TypeError("A splat must be final");
        }
      }
      validate(route.children, new Set([...ancestors, route]));
    }
  };
  validate(options.routes);
  const current = sig<RouterState>({ status: "idle", location: initial, matches: [] });
  const visible = sig<RouterState>(current[0]());
  const queries = createQueryClient();
  const preloaded = new Set<string>();
  const resolved = new WeakMap<Function, Promise<RouteNode>>();
  const lazy = new WeakMap<Function, Promise<any>>();
  let generation = 0;
  let navigation: AbortController | undefined;
  let root: HTMLElement | undefined;
  let started = false;
  let stopBrowser: (() => void) | undefined;

  /** Resolve file-split definitions once, preserving generated children. */
  const resolveRoute = async (route: RouteNode): Promise<RouteNode> => {
    if (!route._load) {
      return route;
    }
    const load = route._load;
    let task = resolved.get(load);
    if (!task) {
      task = load()
        .then(({ Route: actual }) => {
          if (!actual || actual.path !== route.path) {
            throw new TypeError(`Generated route path does not match its module: ${route.path}`);
          }
          const owner = resolvedIds.get(actual.id);
          if (owner && owner !== load) {
            throw new TypeError(`Duplicate loaded route id: ${actual.id}`);
          }
          resolvedIds.set(actual.id, load);
          return actual;
        })
        .catch((error) => {
          resolved.delete(load);
          throw error;
        });
      resolved.set(load, task);
    }
    return {
      ...(await task),
      children: route.children.length ? route.children : (await task).children,
    };
  };

  /** Keep all navigation inside the configured origin and base path. */
  const internalURL = (input: string): URL => {
    const url = new URL(input, current[0]().location);
    if (
      url.origin !== initial.origin ||
      (basepath && url.pathname !== basepath && !url.pathname.startsWith(`${basepath}/`))
    ) {
      throw new TypeError("Navigation must stay within this router's origin and basepath");
    }
    return url;
  };

  /** Serialize typed navigation inputs into a stable, encoded URL. */
  const href = <P extends RoutePaths<R>>(input: Navigation<R, P>): string => {
    if (!definitions.has(input.to)) {
      throw new TypeError(`Unknown route: ${input.to}`);
    }
    const url = new URL(`${basepath}${buildPath(input.to, input.params)}`, initial.origin);
    for (const [key, value] of Object.entries(input.search ?? {}).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (value === undefined) {
        continue;
      }
      for (const part of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(
          key,
          typeof part === "object" ? JSON.stringify(part) : String(part),
        );
      }
    }
    if (input.hash) {
      url.hash = input.hash.startsWith("#") ? input.hash : `#${input.hash}`;
    }
    return url.pathname + url.search + url.hash;
  };

  /** Reuse split component imports without delaying independent loader requests. */
  const loadComponent = async (route: RouteNode) => {
    if (route.lazy) {
      let task = lazy.get(route.lazy);
      if (!task) {
        task = route
          .lazy()
          .then((module) => module.default)
          .catch((error) => {
            lazy.delete(route.lazy!);
            throw error;
          });
        lazy.set(route.lazy, task);
      }
      route.component = await task;
    }
  };

  /** Share route loader data through Query's canonical keys and freshness policy. */
  const loadData = async (match: Match, signal: AbortSignal, preload: boolean) => {
    const route = match.route;
    if (!route.loader) {
      return;
    }
    const dependencies = route.loaderDeps ? route.loaderDeps(match.search) : match.search;
    const key = ["router", route.id, match.params, dependencies] as QueryKey;
    const identity = hashQueryKey(key);
    const staleTime =
      preload || preloaded.has(identity)
        ? (route.preloadStaleTime ?? options.preloadStaleTime ?? 30_000)
        : (route.staleTime ?? options.staleTime ?? 0);
    if (preload) {
      preloaded.add(identity);
      if (preloaded.size > 128) {
        preloaded.delete(preloaded.values().next().value!);
      }
    }
    match.data = await queries.fetchQuery(
      key,
      (sharedSignal) =>
        route.loader!({
          params: match.params,
          search: match.search,
          signal: sharedSignal,
          preload,
        }),
      { signal, staleTime },
    );
    if (!preload) {
      preloaded.delete(identity);
    }
  };

  /** Match, validate and guard top-down, then share independent route loaders in parallel. */
  const resolveLocation = async (
    url: URL,
    signal: AbortSignal,
    preload: boolean,
  ): Promise<RouterState> => {
    const pathname = url.pathname.slice(basepath.length) || "/";
    let branch: RouteNode[] | undefined;
    const matches: Match[] = [];
    let errorIndex = 0;
    try {
      branch = matchRoutes(options.routes, pathname);
      if (!branch) {
        return { status: "not-found", location: url, matches: [] };
      }
      const search = readSearch(url);
      const params = matchPath(
        branch.findLast((route) => route.path !== null)!.path!,
        pathname,
      )!.params;
      const modules = await Promise.allSettled(branch.map(resolveRoute));
      for (const module of modules) {
        signal.throwIfAborted();
        errorIndex = matches.length;
        if (module.status === "rejected") {
          throw module.reason;
        }
        const route = module.value;
        const validated = route.validateSearch ? route.validateSearch(search) : {};
        if (
          !validated ||
          typeof validated !== "object" ||
          Array.isArray(validated) ||
          "then" in validated
        ) {
          throw new TypeError("validateSearch must return a synchronous search object");
        }
        const match: Match = { id: route.id, route, params, search: validated, data: undefined };
        matches.push(match);
        await route.beforeLoad?.({ params, search: validated, signal, preload });
      }
      signal.throwIfAborted();
      const outcomes = await Promise.allSettled(
        matches.map(async (match) => {
          const route = match.route;
          await Promise.all([loadComponent(route), loadData(match, signal, preload)]);
        }),
      );
      signal.throwIfAborted();
      const failure = outcomes.findIndex((result) => result.status === "rejected");
      if (failure !== -1) {
        errorIndex = failure;
        throw (outcomes[failure] as PromiseRejectedResult).reason;
      }
      return { status: "success", location: url, matches };
    } catch (error) {
      if (signal.aborted || error instanceof Redirect) {
        throw error;
      }
      return {
        status: error instanceof NotFound ? "not-found" : "error",
        location: url,
        matches,
        error,
        errorIndex,
      };
    }
  };

  /** Restore entry-specific scroll positions, hash targets and accessible route focus. */
  const finishNavigation = (url: URL, resetScroll: boolean, restore?: { x: number; y: number }) => {
    if (!browser || !root) {
      return;
    }
    const focus =
      root.querySelector<HTMLElement>("[data-router-focus]") ??
      root.querySelector<HTMLElement>("h1") ??
      root.querySelector<HTMLElement>("main");
    if (focus) {
      const previous = focus.getAttribute("tabindex");
      if (previous === null) {
        focus.setAttribute("tabindex", "-1");
      }
      focus.focus({ preventScroll: true });
      if (previous === null) {
        focus.removeAttribute("tabindex");
      }
    }
    let hash: Element | null = null;
    try {
      hash = url.hash
        ? browser.document.getElementById(decodeURIComponent(url.hash.slice(1)))
        : null;
    } catch {}
    if (restore) {
      browser.scrollTo(restore.x, restore.y);
    } else if (hash) {
      hash.scrollIntoView();
    } else if (resetScroll) {
      browser.scrollTo(0, 0);
    }
  };

  /** Commit only the latest invocation, including delayed View Transition callbacks. */
  const perform = async (
    input: string,
    settings: {
      history?: "push" | "replace";
      resetScroll?: boolean;
      viewTransition?: boolean;
      signal?: AbortSignal;
      restore?: { x: number; y: number };
    } = {},
  ): Promise<RouterState> => {
    let url = internalURL(input);
    const version = ++generation;
    navigation?.abort();
    const controller = new AbortController();
    navigation = controller;
    const signal = settings.signal
      ? AbortSignal.any([controller.signal, settings.signal])
      : controller.signal;
    root?.setAttribute("aria-busy", "true");
    set(current, { ...current[0](), status: "pending", error: undefined });
    const restoreCancelled = () => {
      if (version === generation) {
        root?.setAttribute("aria-busy", "false");
        set(current, visible[0]());
      }
    };
    signal.addEventListener("abort", restoreCancelled, { once: true });
    if (signal.aborted) {
      restoreCancelled();
    }
    try {
      let outcome: RouterState;
      let history = settings.history;
      try {
        for (let redirects = 0; ; redirects++) {
          if (redirects > 10) {
            throw new Error("Too many route redirects");
          }
          try {
            outcome = await resolveLocation(url, signal, false);
            break;
          } catch (error) {
            if (!(error instanceof Redirect)) {
              throw error;
            }
            url = internalURL(error.href);
            if (error.replace) {
              history = "replace";
            }
          }
        }
      } catch (error) {
        if (signal.aborted || version !== generation) {
          return current[0]();
        }
        outcome = { status: "error", location: url, matches: [], error };
      }
      if (signal.aborted || version !== generation) {
        return current[0]();
      }
      let committed = false;
      const commit = () => {
        if (committed || version !== generation || signal.aborted) {
          return;
        }
        committed = true;
        if (browser && history) {
          const previous = browser.history.state;
          if (history === "push") {
            browser.history.replaceState(
              { ...previous, __hedystiaRouter: { x: browser.scrollX, y: browser.scrollY } },
              "",
            );
          }
          browser.history[history === "push" ? "pushState" : "replaceState"](
            { __hedystiaRouter: { x: 0, y: 0 } },
            "",
            url.href,
          );
        }
        root?.setAttribute("aria-busy", "false");
        set(visible, outcome);
        set(current, outcome);
        finishNavigation(url, settings.resetScroll !== false, settings.restore);
      };
      if (
        browser &&
        (settings.viewTransition ?? options.viewTransitions) &&
        !browser.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        browser.document.startViewTransition
      ) {
        try {
          const transition = browser.document.startViewTransition(commit);
          transition.finished.catch(() => {});
          await transition.updateCallbackDone;
        } catch {
          commit();
        }
      } else {
        commit();
      }
      return current[0]();
    } finally {
      signal.removeEventListener("abort", restoreCancelled);
    }
  };

  /** Stop browser listeners and abandon navigation without clearing caller-owned DOM. */
  const stop = () => {
    generation++;
    navigation?.abort();
    stopBrowser?.();
    stopBrowser = undefined;
    started = false;
    root?.setAttribute("aria-busy", "false");
    set(current, visible[0]());
    root = undefined;
  };

  const router: Router<R> = {
    options,
    state: current[0],
    viewState: visible[0],
    href,
    navigate: (input) =>
      perform(href(input), { ...input, history: input.replace ? "replace" : "push" }),
    preload: async (input) => {
      const signal = input.signal ?? new AbortController().signal;
      const outcome = await resolveLocation(internalURL(href(input)), signal, true);
      if (outcome.error) {
        throw outcome.error;
      }
    },
    load: (url = browser?.location.href ?? current[0]().location.href) => perform(url),
    invalidate: () => {
      queries.invalidate();
      preloaded.clear();
      return perform(current[0]().location.href);
    },
    match: (path) => current[0]().matches.find((match) => match.route.path === path) as any,
    stop,
    start: async (target) => {
      if (started) {
        return current[0]();
      }
      started = true;
      root = target;
      if (browser) {
        const restoration = browser.history.scrollRestoration;
        browser.history.scrollRestoration = "manual";
        const pop = (event: PopStateEvent) => {
          perform(browser.location.href, {
            restore: event.state?.__hedystiaRouter ?? browser.history.state?.__hedystiaRouter,
          });
        };
        const scroll = () => {
          if (browser.location.href === visible[0]().location.href) {
            browser.history.replaceState(
              {
                ...browser.history.state,
                __hedystiaRouter: { x: browser.scrollX, y: browser.scrollY },
              },
              "",
            );
          }
        };
        const click = (event: MouseEvent) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          const anchor =
            event.target &&
            ((event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null);
          if (
            !anchor ||
            !root?.contains(anchor) ||
            anchor.hasAttribute("download") ||
            anchor.relList.contains("external") ||
            (anchor.target && anchor.target !== "_self") ||
            anchor.hasAttribute("data-router-ignore")
          ) {
            return;
          }
          let url: URL;
          try {
            url = internalURL(anchor.href);
            if (!matchRoutes(options.routes, url.pathname.slice(basepath.length) || "/")) {
              return;
            }
          } catch {
            return;
          }
          event.preventDefault();
          perform(url.href, { history: "push" });
        };
        browser.addEventListener("popstate", pop);
        browser.addEventListener("scroll", scroll, { passive: true });
        target?.addEventListener("click", click);
        stopBrowser = () => {
          browser.removeEventListener("popstate", pop);
          browser.removeEventListener("scroll", scroll);
          target?.removeEventListener("click", click);
          browser.history.scrollRestoration = restoration;
        };
      }
      return router.load();
    },
    mount: (target) => {
      const app = mountView(() => RouterView({ router }), target);
      router.start(target);
      return {
        root: app.root,
        dispose: () => {
          router.stop();
          app.dispose();
        },
      };
    },
    Link: (props) => createLink(router, props),
  };
  return router;
}
