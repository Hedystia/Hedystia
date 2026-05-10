/**
 * @hedystia/view — Reactive UI engine
 *
 * Fine-grained signals, no Virtual DOM, real DOM nodes.
 */

// Context
export { ctx, use } from "./context";
// Fetch
export { action, load } from "./fetch";
// JSX runtime exports (for programmatic use)
export {
  type ElementType,
  effect,
  Fragment,
  type FunctionComponent,
  jsx,
  jsxs,
} from "./jsx/element";
// JSX types
export type { JSX } from "./jsx.d";
// Lifecycle
export { onCleanup, onMount, onReady } from "./lifecycle";
export type { ViewApp } from "./render";
// Render
export {
  ErrorBoundary,
  For,
  Index,
  Match,
  mount,
  Portal,
  renderToString,
  Show,
  Suspense,
  Switch,
} from "./render";
// Scheduler
export { forceFlush, nextFrame, tick } from "./scheduler";
export type { Computed as ComputedSignal, Owner, ReadonlySignal, Signal } from "./signal";
// Signal system
export { batch, createRoot, memo, peek, set, sig, untrack, update, val } from "./signal";
// Store
export { patch, reset, snap, store } from "./store";
// Style
export { merge, style, toCssString } from "./style";
export type { LayoutResult, PreparedText } from "./text";
// Text
export { layout, prepare, reactiveLayout } from "./text";
// Component types
export type {
  Action,
  Component,
  ComputedStyle,
  Context,
  FlowComponent,
  ParentComponent,
  Resource,
  Store,
  StoreNode,
  StoreValue,
  StyleProps,
} from "./types";
// Watch
export { on, once, watch, watchAll } from "./watch";
