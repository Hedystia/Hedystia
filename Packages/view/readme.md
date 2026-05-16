# @hedystia/view

Reactive UI engine — fine-grained signals, no Virtual DOM, real DOM nodes.

## Installation

```bash
bun add @hedystia/view
```

## Quick Start

Configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@hedystia/view"
  }
}
```

```tsx
import { sig, mount } from "@hedystia/view";

function Counter() {
  const [count, setCount] = sig(0);

  return (
    <div style={{ padding: "16px" }}>
      <h1>Counter: {count}</h1>
      <button type="button" onClick={() => setCount((c) => c + 1)}>+</button>
    </div>
  );
}

mount(Counter, document.getElementById("root")!);
```

> Components run **once**. Reactivity comes from signal accessors or wrapping signal reads in `() => ...` functions.

## Signals

```tsx
import { sig, val, set, update, memo, batch, peek, untrack } from "@hedystia/view";

// Traditional API
const count = sig(0);
count();    // Read (now callable directly!)
val(count); // Read (tracked)
set(count, 5); // Write
update(count, (prev) => prev + 1); // Update

// Destructured API (Preferred)
const [value, setValue] = sig(0);
value(); // Read
setValue(5); // Write
setValue((prev) => prev + 1); // Update

// Universal val()
val(5);       // 5
val(value);   // 0
val(() => 1); // 1

// Derived / computed
const doubled = memo(() => value() * 2);

// Batch multiple updates into one reactive cycle
batch(() => {
  set(a, 1);
  set(b, 2);
});

// Read without tracking
peek(count);

// Run without tracking
untrack(() => val(count));
```

### JSX reactive patterns

```tsx
function App() {
  const count = sig(0);
  const doubled = memo(() => val(count) * 2);

  return (
    <div>
      {/* Reactive text — wrap in () => */}
      <span>{() => val(count)}</span>
      <span>Doubled: {() => val(doubled)}</span>

      {/* Reactive class — pass a function, signal, or array */}
      <div class={["base", active, () => "reactive"]} />

      {/* Reactive classList — object with boolean values (static or reactive) */}
      <div classList={{ active: isActive, "is-loading": loading }} />

      {/* Reactive style — pass a function */}
      <div style={() => ({ color: val(count) > 5 ? "red" : "blue" })}>
        Dynamic color
      </div>

      {/* Reactive prop — pass a function */}
      <input value={() => `Count is ${val(count)}`} />

      {/* Reactive list — function child returning array */}
      <ul>
        {() => val(items).map((item) => (
          <li>{item.name}</li>
        ))}
      </ul>

      {/* Events */}
      <button type="button" onClick={() => set(count, val(count) + 1)}>+</button>
    </div>
  );
}
```

## Flow Components

@hedystia/view provides built-in components for control flow. Since there is no Virtual DOM, these components ensure that only the necessary parts of the DOM are updated efficiently.

> **Pro Tip**: Use functions `{() => <Component />}` inside flow components to ensure they are created and cleaned up correctly within the reactive scope.

### Show (Conditional Rendering)

```tsx
import { sig, mount, Show } from "@hedystia/view";

function App() {
  const [loggedIn, setLoggedIn] = sig(false);

  return (
    <div>
      <button type="button" onClick={() => setLoggedIn(!loggedIn())}>
        {() => loggedIn() ? "Log out" : "Log in"}
      </button>

      <Show
        when={loggedIn}
        fallback={<p>Please log in to continue.</p>}
      >
        <div>
          <h2>Welcome back!</h2>
          <p>You are logged in.</p>
        </div>
      </Show>
    </div>
  );
}
```

### For (Keyed List)

```tsx
import { sig, val, mount, For } from "@hedystia/view";

interface Todo {
  id: number;
  text: string;
}

function TodoList() {
  const [todos, setTodos] = sig<Todo[]>([
    { id: 1, text: "Learn signals" },
    { id: 2, text: "Build an app" },
  ]);

  return (
    <ul>
      <For each={todos} key={(todo) => todo.id}>
        {(todo, index) => (
          <li>
            {() => `${index + 1}. ${todo.text}`}
          </li>
        )}
      </For>
    </ul>
  );
}
```

### Switch / Match (Multiple Branching)

```tsx
import { sig, mount, Switch, Match } from "@hedystia/view";

function StatusView() {
  const [status, setStatus] = sig("loading");

  return (
    <Switch fallback={<p>Unknown state</p>}>
      <Match when={() => status() === "loading"}>
        <p>Loading data...</p>
      </Match>
      <Match when={() => status() === "success"}>
        {() => <SuccessContent />}
      </Match>
    </Switch>
  );
}
```

### Portal (Out-of-tree Rendering)

```tsx
import { Portal } from "@hedystia/view";

function Modal() {
  return (
    <Portal mount={document.body}>
      <div class="modal-overlay">
        <div class="modal-content">Hello from Portal!</div>
      </div>
    </Portal>
  );
}
```

## Context

Context provides a way to share data through the component tree without passing props manually.

```tsx
import { ctx, use, sig, mount } from "@hedystia/view";

const ThemeCtx = ctx("light");

function App() {
  const [theme, setTheme] = sig("dark");

  return (
    <ThemeCtx.Provider value={theme}>
      <div>
        <button type="button" onClick={() => setTheme(theme() === "dark" ? "light" : "dark")}>
          Toggle Theme
        </button>
        <ThemeDisplay />
      </div>
    </ThemeCtx.Provider>
  );
}

function ThemeDisplay() {
  const currentTheme = use(ThemeCtx);
  return <div>Current theme is: {currentTheme}</div>;
}
```

## Store

Nested reactive state with fine-grained updates:

```tsx
import { store, val, set, patch } from "@hedystia/view";

const app = store({
  user: { name: "guest", role: "viewer" },
  theme: "dark",
  count: 0,
});

function Profile() {
  return (
    <div>
      <span>{() => val(app.user.name)}</span>
      <button type="button" onClick={() => set(app.theme, "light")}>Light mode</button>
      <button type="button" onClick={() => patch(app.user, { name: "alice", role: "admin" })}>
        Login
      </button>
    </div>
  );
}
```

## Effects & Watchers

```tsx
import { effect, on, watch } from "@hedystia/view";

// Run a side effect whenever dependencies change (eager)
effect(() => {
  console.log("Count is now:", count());
});

// Run with access to previous value (untracked callback)
on(count, (current, prev) => {
  console.log(`Changed from ${prev} to ${current}`);
});

// Watch a signal or accessor directly
watch(count, (val) => {
  console.log("Updated:", val);
});
```

## Data Fetching

```tsx
import { sig, val, set, load, action } from "@hedystia/view";

const userId = sig(1);

const user = load(
  () => val(userId),
  async (id) => {
    const res = await fetch(`/api/users/${id}`);
    return res.json();
  }
);

function UserCard() {
  return (
    <div>
      {() => {
        if (val(user.loading)) return <span>Loading...</span>;
        if (val(user.error)) return <span>Error: {val(user.error)!.message}</span>;
        return <span>{val(user.data)?.name}</span>;
      }}
    </div>
  );
}
```

## API Reference

| Category | Functions |
|----------|-----------|
| **Signals** | `sig`, `val`, `set`, `update`, `memo`, `batch`, `peek`, `untrack`, `adopt` |
| **Store** | `store`, `patch`, `reset`, `snap` |
| **Effects** | `effect`, `on`, `once`, `watch`, `watchAll` |
| **Lifecycle** | `onMount`, `onCleanup`, `onReady` |
| **Context** | `ctx`, `use` |
| **Fetch** | `load`, `action` |
| **Flow** | `Show`, `For`, `Index`, `Switch`, `Match`, `Portal`, `Suspense`, `ErrorBoundary` |
| **Render** | `mount`, `renderToString` |
| **Text** | `prepare`, `layout`, `reactiveLayout` |
| **Style** | `style`, `merge`, `toCssString` |
| **Scheduler** | `tick`, `nextFrame`, `forceFlush` |

## License

MIT
