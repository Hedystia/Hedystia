/**
 * Reactive signal system for @hedystia/view
 *
 * Signals provide mutable state with automatic dependency tracking.
 */

import type {
  Computation,
  Computed,
  EffectFunction,
  Owner as OwnerType,
  ReadonlySignal,
  Signal,
  SignalOptions,
} from "../types";
import { equalFn } from "../utils";

/** @internal */
export let Owner: OwnerType | null = null;

/** @internal */
export let Listener: Computation<any> | null = null;

/** @internal */
let Updates: Computation<any>[] | null = null;

/** @internal */
const _Effects: Computation<any>[] | null = null;

/** @internal */
export let Pending: Computation<any>[] | null = null;

/**
 * Create a reactive signal with an initial value
 */
export function sig<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  const s = {
    _value: initial,
    _observers: null,
    _observerSlots: null,
    _comparator: options?.equals !== undefined ? (options.equals as any) : equalFn,
  } as Signal<T>;

  const getter = () => val(s);
  const setter = (v: any) => {
    if (typeof v === "function") {
      return update(s, v);
    }
    return set(s, v);
  };

  Object.defineProperty(s, 0, { value: getter });
  Object.defineProperty(s, 1, { value: setter });
  Object.defineProperty(s, Symbol.iterator, {
    value: function* () {
      yield getter;
      yield setter;
    },
  });

  return s;
}

/**
 * Read the value of a signal, registering a dependency if inside a reactive context
 */
export function val<T>(signal: Signal<T> | Computed<T> | (() => T)): T {
  // Handle accessor function (used in SSR For/Index children)
  if (typeof signal === "function" && !("_value" in signal)) {
    return (signal as () => T)();
  }
  const s = signal as ReadonlySignal<T>;
  if (Listener !== null) {
    if (s._observers === null) {
      s._observers = [];
      s._observerSlots = [];
    }

    // Check if already registered
    let index = s._observers.indexOf(Listener);
    if (index === -1) {
      index = s._observers.length;
      s._observers.push(Listener);
      s._observerSlots!.push(Listener._sources === null ? 0 : Listener._sources.length);

      if (Listener._sources === null) {
        Listener._sources = [];
        Listener._sourceSlots = [];
      }
      Listener._sources.push(s);
      Listener._sourceSlots!.push(index);
    }
  }

  // Check if computed needs re-evaluation
  const computed = s as Computed<T>;
  if (computed._state === 1) {
    recompute(computed);
  }

  return s._value;
}

/** @internal - Register a computation or root with the current owner */
export function adopt(node: Computation<any> | OwnerType): void {
  if (Owner !== null) {
    if (Owner._owned === null) {
      Owner._owned = [node as any];
    } else {
      Owner._owned.push(node as any);
    }
  }
}

/** @internal - Remove a computation from all its source observer lists */
export function cleanupSources(computation: Computation<any>): void {
  if (computation._sources !== null) {
    for (let j = computation._sources.length - 1; j >= 0; j--) {
      const source: ReadonlySignal<any> = computation._sources[j]!;
      const index = computation._sourceSlots![j]!;
      const obs = source._observers;
      const obsSlots: number[] | null = source._observerSlots;
      if (obs && obsSlots && index < obs.length) {
        // Swap-and-pop: move last observer into this slot
        const last = obs.pop()!;
        const lastSlot = obsSlots.pop()!;
        if (index < obs.length) {
          obs[index] = last;
          obsSlots[index] = lastSlot;
          // Update the swapped observer's _sourceSlots to point to new index
          if (last._sourceSlots) {
            last._sourceSlots[lastSlot] = index;
          }
        }
      }
    }
    computation._sources = null;
    computation._sourceSlots = null;
  }
}

/** @internal - Run a computation with proper Listener tracking */
export function runComputation<T>(computation: Computation<T>): T | undefined {
  const prevListener = Listener;
  const prevOwner = Owner;

  cleanNode(computation);
  cleanupSources(computation);

  Listener = computation;
  Owner = computation;

  try {
    const value = computation._fn(computation._value as any);
    computation._value = value;
    computation._state = 0;

    const computed = (computation as any)._computed as Computed<T> | undefined;
    if (computed) {
      computed._value = value as T;
      computed._state = 0;
    }

    return value;
  } finally {
    Listener = prevListener;
    Owner = prevOwner;
  }
}

/** @internal */
function recompute<T>(computed: Computed<T>): void {
  const computation = (computed as any)._computation as Computation<T>;
  if (!computation?._fn) {
    return;
  }
  runComputation(computation);
}

/**
 * Set the value of a signal, notifying dependents
 */
export function set<T>(signal: Signal<T>, value: T): T {
  const comparator = signal._comparator;
  if (comparator?.(signal._value, value)) {
    return value;
  }
  signal._value = value;
  if (signal._observers !== null) {
    scheduleUpdate(signal);
  }
  return value;
}

/**
 * Update a signal's value using a function of the previous value
 */
export function update<T>(signal: Signal<T>, fn: (prev: T) => T): T {
  const value = fn(signal._value);
  return set(signal, value);
}

/**
 * Read a signal's value without registering a dependency
 */
export function peek<T>(signal: Signal<T>): T {
  return signal._value;
}

/** @internal - Propagate stale state through computed/memo observers */
function markDownstream(node: { _observers: Computation<any>[] | null }): void {
  const observers = node._observers;
  if (!observers) {
    return;
  }

  for (let i = 0; i < observers.length; i++) {
    const observer = observers[i]!;
    if (observer._state !== 0) {
      continue;
    }

    observer._state = 1;

    const computed = (observer as any)._computed as Computed<any> | undefined;
    if (computed) {
      computed._state = 1;
      markDownstream(computed);
    }

    if (observer._user) {
      if (Pending === null) {
        Pending = [];
      }
      Pending.push(observer);
    }
  }
}

/** @internal */
function scheduleUpdate<T>(signal: Signal<T>): void {
  const observers = signal._observers;
  if (observers === null) {
    return;
  }

  for (let i = 0; i < observers.length; i++) {
    const observer = observers[i]!;
    if (observer._state === 0) {
      observer._state = 1;

      const computed = (observer as any)._computed as any;
      if (computed) {
        computed._state = 1;
        // Propagate stale state through downstream observers of this computed
        markDownstream(computed);
      }

      if (Pending === null) {
        Pending = [];
      }
      Pending.push(observer);
    }
  }

  // Only flush if not in a batch
  if (Updates === null) {
    flushUpdates();
  }
}

/** @internal */
function flushUpdates(): void {
  const updates = Pending;
  Pending = null;
  if (updates === null) {
    return;
  }

  for (let i = 0; i < updates.length; i++) {
    const computation = updates[i]!;

    if (computation._user && computation._state === 1) {
      runComputation(computation);
    }
    // Non-user computations (memos) stay stale for lazy re-evaluation.
    // Don't force _state=1 here — recompute() may have already resolved it to 0.
  }
  Updates = null;
}

/**
 * Create a derived reactive signal (computed value)
 */
export function memo<T>(fn: () => T): Computed<T> {
  const computed: Computed<T> = {
    _fn: fn,
    _value: undefined as T,
    _observers: null,
    _observerSlots: null,
    _sources: null,
    _sourceSlots: null,
    _state: 1,
  } as Computed<T>;

  const computation: Computation<T> = {
    _fn: fn as EffectFunction<T>,
    _value: undefined,
    _sources: null,
    _sourceSlots: null,
    _observers: null,
    _observerSlots: null,
    _owner: Owner,
    _owned: null,
    _cleanups: null,
    _context: null,
    _suspense: null,
    _user: false,
    _pure: true,
    _state: 1,
    _updatedAt: null,
  };

  // Link computed and computation bidirectionally
  (computed as any)._computation = computation;
  (computation as any)._computed = computed;

  // Register with parent owner
  adopt(computation);

  // Make computed callable and proxy all properties to computed
  const callable = (() => {
    if (computed._state === 1) {
      recompute(computed);
    }
    return computed._value;
  }) as Computed<T>;

  // Proxy all properties to computed so they stay in sync
  Object.defineProperty(callable, "_state", {
    get() {
      return computed._state;
    },
    set(v: 0 | 1 | 2) {
      computed._state = v;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(callable, "_value", {
    get() {
      return computed._value;
    },
    set(v: T) {
      computed._value = v;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(callable, "_observers", {
    get() {
      return computed._observers;
    },
    set(v: any) {
      computed._observers = v;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(callable, "_observerSlots", {
    get() {
      return computed._observerSlots;
    },
    set(v: any) {
      computed._observerSlots = v;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(callable, "_sources", {
    get() {
      return computed._sources;
    },
    set(v: any) {
      computed._sources = v;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(callable, "_sourceSlots", {
    get() {
      return computed._sourceSlots;
    },
    set(v: any) {
      computed._sourceSlots = v;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(callable, "_fn", {
    get() {
      return computed._fn;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(callable, "_computation", {
    get() {
      return (computed as any)._computation;
    },
    set(v: any) {
      (computed as any)._computation = v;
    },
    enumerable: true,
    configurable: true,
  });

  // Initial computation
  recompute(computed);

  return callable;
}

/**
 * Execute a function without tracking signal dependencies
 */
export function untrack<T>(fn: () => T): T {
  const prevListener = Listener;
  Listener = null;
  try {
    return fn();
  } finally {
    Listener = prevListener;
  }
}

/**
 * Batch multiple signal updates into a single reactive cycle
 */
export function batch(fn: () => void): void {
  const prevUpdates = Updates;
  const prevPending = Pending;
  Updates = [];
  Pending = [];
  try {
    fn();
  } finally {
    // Collect all pending updates
    if (prevPending !== null && prevPending.length > 0) {
      Pending = prevPending.concat(Pending);
    }
    Updates = prevUpdates;
    // Flush after batch completes
    flushUpdates();
  }
}

/**
 * Create a reactive root context
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const prevOwner = Owner;
  const prevListener = Listener;
  const root: OwnerType = {
    _owned: null,
    _cleanups: null,
    _owner: prevOwner,
    _context: null,
  };
  Owner = root;
  Listener = null;

  // Register with parent owner
  adopt(root);

  try {
    return fn(() => cleanRoot(root));
  } finally {
    Owner = prevOwner;
    Listener = prevListener;
  }
}

/** @internal */
function cleanRoot(root: OwnerType): void {
  if (root._cleanups !== null) {
    const cleanups = root._cleanups;
    root._cleanups = null;
    // Run cleanups in reverse order (LIFO)
    for (let i = cleanups.length - 1; i >= 0; i--) {
      cleanups[i]!();
    }
  }
  if (root._owned !== null) {
    const owned = root._owned;
    root._owned = null;
    for (let i = 0; i < owned.length; i++) {
      cleanNode(owned[i]!);
    }
  }
}

/**
 * Register a cleanup callback to run when the owner is disposed
 */
export function onCleanup(fn: () => void): void {
  if (Owner === null) {
    return;
  }
  if (Owner._cleanups === null) {
    Owner._cleanups = [];
  }
  Owner._cleanups.push(fn);
}

/** @internal */
export function cleanNode(node: Computation<any> | OwnerType): void {
  if ("_sources" in node) {
    cleanupSources(node as Computation<any>);
  }
  if ("_cleanups" in node && node._cleanups !== null) {
    const cleanups = node._cleanups;
    node._cleanups = null;
    // Run cleanups in reverse order (LIFO)
    for (let i = cleanups.length - 1; i >= 0; i--) {
      cleanups[i]!();
    }
  }
  if ("_owned" in node && node._owned !== null) {
    const owned = node._owned;
    node._owned = null;
    for (let i = 0; i < owned.length; i++) {
      cleanNode(owned[i]!);
    }
  }
}
