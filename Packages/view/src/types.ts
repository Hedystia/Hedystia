/**
 * Shared types for @hedystia/view
 */

import type { JSX } from "./jsx.d";

/**
 * Function that returns a value of type T - used for reactive accessors
 */
export type Accessor<T> = () => T;

/**
 * Function that sets a value of type T - used for reactive setters
 */
export interface Setter<T> {
  (value: T): T;
  (value: (prev: T) => T): T;
}

/**
 * Base reactive signal properties
 */
export interface SignalBase<T> {
  /** @internal */
  _value: T;
  /** @internal */
  _observers: Computation<any>[] | null;
  /** @internal */
  _observerSlots: number[] | null;
  /** @internal */
  _comparator?: (prev: T, next: T) => boolean;
}

/**
 * Mutable reactive signal holding a value of type T
 * Supports:
 * - Calling directly: signal() -> val(signal)
 * - Destructuring: [val, set] = signal
 * - Traditional API: val(signal), set(signal, v)
 */
export type Signal<T> = SignalBase<T> & [Accessor<T>, Setter<T>] & (() => T);

/**
 * Read-only derived reactive signal computed from other signals
 */
export interface Computed<T> extends SignalBase<T> {
  /** @internal */
  _fn: () => T;
  /** @internal */
  _sources: ReadonlySignal<any>[] | null;
  /** @internal */
  _sourceSlots: number[] | null;
  /** @internal */
  _state: 0 | 1 | 2;
  /** Call to get the current value */
  (): T;
}

/**
 * Union type for reading signal values
 */
export type ReadonlySignal<T> = Signal<T> | Computed<T>;

/**
 * Internal computation node in the reactive graph
 */
export interface Computation<T> {
  /** @internal */
  _fn: EffectFunction<T>;
  /** @internal */
  _value: T | undefined;
  /** @internal */
  _sources: ReadonlySignal<any>[] | null;
  /** @internal */
  _sourceSlots: number[] | null;
  /** @internal */
  _observers: Computation<any>[] | null;
  /** @internal */
  _observerSlots: number[] | null;
  /** @internal */
  _owner: Owner | null;
  /** @internal */
  _owned: (Computation<any> | Owner)[] | null;
  /** @internal */
  _cleanups: (() => void)[] | null;
  /** @internal */
  _context: any | null;
  /** @internal */
  _suspense: SuspenseContextType | null;
  /** @internal */
  _user: boolean;
  /** @internal */
  _pure: boolean;
  /** @internal */
  _state: 0 | 1 | 2;
  /** @internal */
  _updatedAt: number | null;
}

/**
 * Reactive owner/context node
 */
export interface Owner {
  /** @internal */
  _owned: (Computation<any> | Owner)[] | null;
  /** @internal */
  _cleanups: (() => void)[] | null;
  /** @internal */
  _owner: Owner | null;
  /** @internal */
  _context: any | null;
}

/**
 * Effect function type for computations
 */
export type EffectFunction<T> = (prev?: T) => T;

/**
 * Options for creating a signal
 */
export interface SignalOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
  name?: string;
}

/**
 * Options for creating a memo
 */
export interface MemoOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
  name?: string;
}

/**
 * Component function type
 */
export type Component<P extends Record<string, any> = {}> = (props: P) => JSX.Element;

/**
 * Component that accepts children
 */
export type ParentComponent<P extends Record<string, any> = {}> = Component<
  P & { children?: JSX.Children }
>;

/**
 * Component that requires children
 */
export type FlowComponent<P extends Record<string, any> = {}, C = JSX.Children> = Component<
  P & { children: C }
>;

/**
 * Context object for provider/consumer pattern
 */
export interface Context<T> {
  _id: symbol;
  _defaultValue: T | undefined;
  Provider: Component<{ value: T | Accessor<T> | ReadonlySignal<T>; children: JSX.Element }>;
}

/**
 * Suspense context type for error boundaries and suspense
 */
export interface SuspenseContextType {
  increment: () => void;
  decrement: () => void;
  resolved: boolean;
}

/**
 * Resource state for reactive data fetching
 */
export type ResourceState<T> =
  | { state: "unresolved"; loading: false; error: undefined; data: undefined }
  | { state: "pending"; loading: true; error: undefined; data: undefined }
  | { state: "ready"; loading: false; error: undefined; data: T }
  | { state: "refreshing"; loading: true; error: undefined; data: T }
  | { state: "errored"; loading: false; error: Error; data: undefined };

/**
 * Resource object returned by load()
 */
export interface Resource<T> {
  (): T | undefined;
  readonly state: Accessor<"unresolved" | "pending" | "ready" | "refreshing" | "errored">;
  readonly loading: Accessor<boolean>;
  readonly error: Accessor<Error | undefined>;
  readonly data: Accessor<T | undefined>;
  readonly ready: boolean;
}

/**
 * Action object for mutations
 */
export interface Action<T, A> {
  (args: A): Promise<T>;
  run: (args: A) => Promise<T>;
  readonly loading: Accessor<boolean>;
  readonly error: Accessor<Error | undefined>;
  readonly data: Accessor<T | undefined>;
}

/**
 * Style properties type
 */
export type StyleProps = Record<string, string | number | Accessor<string | number> | undefined>;

/**
 * Computed style object
 */
export type ComputedStyle<T extends StyleProps> = () => T;

/**
 * Store value types
 */
export type StoreValue = string | number | boolean | null | undefined | object | StoreValue[];

/**
 * Store node type for nested access
 */
export type StoreNode<T> = T extends object ? Record<keyof T, StoreNode<T[keyof T]>> : Signal<T>;

/**
 * Store object
 */
export interface Store<T extends Record<string, StoreValue>> {
  [key: string]: StoreNode<T[string]>;
}
