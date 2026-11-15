import { createRoot, getOwner, type JSX, jsx, onCleanup } from "@hedystia/view";
import type { LinkOptions, Navigation, RouteNode, RoutePaths, Router } from "../core/types";

/** Render nested route layers while keeping shared layouts and their reactive owners alive. */
export function RouterView<R extends readonly RouteNode[]>({
  router,
}: {
  router: Router<R>;
}): JSX.Element {
  const owner = getOwner();
  const layers: {
    id: string;
    node: JSX.Element;
    dispose: () => void;
    owner: ReturnType<typeof getOwner>;
  }[] = [];
  const clear = (from: number) => {
    while (layers.length > from) {
      layers.pop()?.dispose();
    }
  };
  onCleanup(() => clear(0));
  const render = (depth: number): JSX.Element => {
    const state = router.viewState();
    if (state.status === "idle" || state.status === "pending") {
      return router.options.pendingComponent?.() ?? null;
    }
    if (state.status === "not-found") {
      clear(0);
      return router.options.notFoundComponent?.() ?? "Not found";
    }
    let boundary = -1;
    if (state.status === "error") {
      for (let index = state.errorIndex ?? state.matches.length - 1; index >= 0; index--) {
        if (state.matches[index]?.route.errorComponent) {
          boundary = index;
          break;
        }
      }
      if (boundary === -1) {
        clear(0);
        return (
          router.options.errorComponent?.({
            error: state.error,
            retry: () => router.invalidate(),
          }) ?? "Unable to load this page"
        );
      }
    }
    const match = state.matches[depth];
    if (!match) {
      clear(depth);
      return null;
    }
    const id = `${match.id}${depth === boundary ? ":error" : ""}`;
    if (layers[depth]?.id === id) {
      return layers[depth]!.node;
    }
    clear(depth);
    const layer = {
      id,
      node: null as JSX.Element,
      dispose: () => {},
      owner: null as ReturnType<typeof getOwner>,
    };
    layers[depth] = layer;
    const node = createRoot(
      (stop) => {
        layer.dispose = stop;
        layer.owner = getOwner();
        if (depth === boundary) {
          return match.route.errorComponent!({
            error: state.error,
            retry: () => router.invalidate(),
          });
        }
        try {
          return (
            match.route.component?.({
              params: () => router.viewState().matches[depth]!.params,
              search: () => router.viewState().matches[depth]!.search,
              data: () => router.viewState().matches[depth]!.data,
              outlet: () => render(depth + 1),
            }) ?? (() => render(depth + 1))
          );
        } catch (error) {
          clear(depth + 1);
          if (!match.route.errorComponent) {
            throw error;
          }
          return match.route.errorComponent({ error, retry: () => router.invalidate() });
        }
      },
      depth ? layers[depth - 1]!.owner : owner,
    );
    layer.node = node;
    return node;
  };
  return () => {
    try {
      return render(0);
    } catch (error) {
      clear(0);
      return (
        router.options.errorComponent?.({ error, retry: () => router.invalidate() }) ??
        "Unable to render this page"
      );
    }
  };
}

/** Render a normal anchor with typed URL construction and cancellable intent preloading. */
export function createLink<R extends readonly RouteNode[], P extends RoutePaths<R>>(
  router: Router<R>,
  props: Navigation<R, P> & LinkOptions,
): JSX.Element {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let preload: AbortController | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    preload?.abort();
    preload = undefined;
  };
  const intent = () => {
    if (
      props.preload === false ||
      timer ||
      props.download ||
      (props.target && props.target !== "_self")
    ) {
      return;
    }
    preload = new AbortController();
    timer = setTimeout(() => {
      timer = undefined;
      router.preload({ ...props, signal: preload!.signal }).catch(() => {});
    }, 50);
  };
  onCleanup(cancel);
  return jsx("a", {
    href: router.href(props),
    target: props.target,
    rel: props.rel,
    download: props.download,
    class: () =>
      [
        props.class,
        router.viewState().location.pathname ===
        new URL(router.href(props), router.viewState().location).pathname
          ? props.activeClass
          : undefined,
      ]
        .filter(Boolean)
        .join(" "),
    children: props.children,
    onClick: props.onClick,
    onMouseEnter: intent,
    onFocus: intent,
    onTouchStart: intent,
    onMouseLeave: cancel,
    onBlur: cancel,
  });
}
