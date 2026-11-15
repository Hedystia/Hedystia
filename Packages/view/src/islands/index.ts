import { hydrate, type ViewApp } from "../render/engine";
import type { Component } from "../types";

type Loaders = Record<string, () => Promise<{ default: Component<any> }>>;
type Active = { cancelled: boolean; started?: boolean; app?: ViewApp; cancel?: () => void };

/** Activate only declared client islands, respecting visibility, media, idle time and removal. */
export function hydrateIslands(
  loaders: Loaders,
  root: Document | HTMLElement = document,
): () => void {
  const active = new Map<HTMLElement, Active>();
  const contains = (element: HTMLElement) => element.isConnected && root.contains(element);
  const report = (element: HTMLElement, error: unknown) => {
    element.dispatchEvent(new CustomEvent("view:island-error", { detail: error, bubbles: true }));
  };
  const scan = () => {
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>("hedystia-island[data-view-src]"),
    );
    if (root instanceof HTMLElement && root.matches("hedystia-island[data-view-src]")) {
      elements.unshift(root);
    }
    for (const element of elements) {
      if (active.has(element) || !contains(element)) {
        continue;
      }
      const parent = element.parentElement?.closest("hedystia-island[data-view-src]");
      if (parent) {
        continue;
      }
      if (!Object.hasOwn(loaders, element.dataset.viewSrc!)) {
        continue;
      }
      const loader = loaders[element.dataset.viewSrc!];
      if (!loader) {
        continue;
      }
      const state: Active = { cancelled: false };
      active.set(element, state);
      const activate = async () => {
        if (state.started || state.cancelled) {
          return;
        }
        state.started = true;
        state.cancel?.();
        state.cancel = undefined;
        try {
          const { default: Component } = await loader();
          if (typeof Component !== "function") {
            throw new TypeError("Island modules must default-export a component");
          }
          if (state.cancelled || !contains(element)) {
            return;
          }
          const props = JSON.parse(element.dataset.viewProps ?? "{}");
          state.app = hydrate(() => Component(props), element);
          element.setAttribute("data-view-active", "");
          scan();
        } catch (error) {
          if (!state.cancelled) {
            report(element, error);
          }
        }
      };
      const when = element.dataset.viewWhen;
      if (when === "visible" && typeof IntersectionObserver !== "undefined") {
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            activate();
          }
        });
        observer.observe(element);
        state.cancel = () => observer.disconnect();
      } else if (when?.startsWith("media:") && typeof window.matchMedia === "function") {
        const query = window.matchMedia(when.slice(6));
        const update = () => {
          if (query.matches) {
            activate();
          }
        };
        query.addEventListener("change", update);
        state.cancel = () => query.removeEventListener("change", update);
        update();
      } else if (when === "idle") {
        if (typeof requestIdleCallback === "function") {
          const id = requestIdleCallback(() => {
            activate();
          });
          state.cancel = () => cancelIdleCallback(id);
        } else {
          const id = setTimeout(() => {
            activate();
          }, 1);
          state.cancel = () => clearTimeout(id);
        }
      } else {
        activate();
      }
    }
  };
  const dispose = (element: HTMLElement, state: Active) => {
    state.cancelled = true;
    try {
      state.cancel?.();
    } finally {
      try {
        state.app?.dispose();
      } finally {
        active.delete(element);
        element.removeAttribute("data-view-active");
      }
    }
  };
  const observer = new MutationObserver(() => {
    for (const [element, state] of active) {
      if (!contains(element)) {
        try {
          dispose(element, state);
        } catch (error) {
          report(element, error);
        }
      }
    }
    scan();
  });
  observer.observe(root, { childList: true, subtree: true });
  if (root instanceof HTMLElement) {
    observer.observe(root.ownerDocument, { childList: true, subtree: true });
    const tree = root.getRootNode();
    if (tree !== root && tree !== root.ownerDocument) {
      observer.observe(tree, { childList: true, subtree: true });
    }
  }
  scan();
  return () => {
    observer.disconnect();
    const errors: unknown[] = [];
    for (const [element, state] of active) {
      try {
        dispose(element, state);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Island cleanup failed");
    }
  };
}
