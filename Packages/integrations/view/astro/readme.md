# @hedystia/astro

## Small reactive islands in Astro

Render View components on the server and mount reactive islands using Astro client directives, with disposal on navigation. Components that intentionally return `null` or an empty string are accepted. Named-slot attributes are escaped. The first client activation hydrates compatible server DOM in place, preserving focus, selection, form edits and Astro slots. Client-only components and changed-prop replacements mount fresh content; persisted islands with unchanged props keep their existing owner.

```sh
npm install @hedystia/astro
```

Astro integration for [@hedystia/view](https://www.npmjs.com/package/@hedystia/view) — use reactive View components within Astro.

## Installation

```bash
bun add @hedystia/astro @hedystia/view
```

## Setup

Add the integration to your `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import hedystiaView from "@hedystia/astro";

export default defineConfig({
  integrations: [hedystiaView()],
});
```

## Quick Start

Create a View component:

```tsx
// src/components/Counter.tsx
import { sig, val, set } from "@hedystia/view";

export default function Counter() {
  const count = sig(0);

  return (
    <div style={{ padding: "16px" }}>
      <h1>Counter: {() => val(count)}</h1>
      <button onClick={() => set(count, val(count) + 1)}>+</button>
    </div>
  );
}
```

Use it in an Astro page with client directives:

```astro
---
// src/pages/index.astro
import Counter from "../components/Counter";
---

<html>
  <body>
    <h1>My Astro Site</h1>
    <Counter client:load />
  </body>
</html>
```

## Client Directives

| Directive | Description |
|-----------|-------------|
| `client:load` | Hydrate on page load |
| `client:idle` | Hydrate when browser is idle |
| `client:visible` | Hydrate when element enters viewport |
| `client:only="@hedystia/astro"` | Client-only rendering (no SSR) |

## Signals & Reactivity

All `@hedystia/view` reactivity features work inside Astro:

```tsx
import { sig, val, set, memo, batch } from "@hedystia/view";

export default function App() {
  const count = sig(0);
  const doubled = memo(() => val(count) * 2);

  return (
    <div>
      <span>{() => val(count)}</span>
      <span>Doubled: {() => val(doubled)}</span>
      <button onClick={() => set(count, val(count) + 1)}>+</button>
    </div>
  );
}
```

## Flow Components

```tsx
import { sig, val, set, Show, For } from "@hedystia/view";

export default function TodoList() {
  const items = sig([
    { id: 1, text: "Learn Astro" },
    { id: 2, text: "Use @hedystia/view" },
  ]);

  return (
    <div>
      <ul>
        {For({
          each: () => val(items),
          key: (item) => item.id,
          children: (item) => <li>{val(item).text}</li>,
        })}
      </ul>
    </div>
  );
}
```

## SSR

Components render to static HTML on the server. The `renderToString` function from `@hedystia/view` is used automatically for server-side rendering.

## API Reference

| Export | Description |
|--------|-------------|
| `default` | Astro integration function |
| `getContainerRenderer` | Container renderer for Astro Container API |

## License

MIT
