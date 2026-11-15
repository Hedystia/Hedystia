# @hedystia/router

Typed routing for Hedystia View: nested layouts, generated lazy file routes, validated search, guards, shared loader caching, preloading and native browser navigation. Runtime dependencies are Hedystia Query and View; no third-party routing library is bundled.

```sh
npm install @hedystia/router
```

## Typed code routes

```tsx
import { createLayout, createRoute, createRouter } from "@hedystia/router";

const user = createRoute("/users/$id", {
  validateSearch: (raw) => {
    const page = Number(raw.page ?? 1);
    if (!Number.isInteger(page) || page < 1) throw new Error("Invalid page");
    return { page };
  },
  loader: async ({ params, search, signal }) => {
    const response = await fetch(`/api/users/${encodeURIComponent(params.id)}?page=${search.page}`, { signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json() as Promise<{ id: string; name: string }>;
  },
  component: ({ data }) => <h1>{() => data().name}</h1>,
});

const root = createLayout("root", {
  component: ({ outlet }) => <main>{outlet}</main>,
}).addChildren([
  createRoute("/", { component: () => <h1>Home</h1> }),
  user,
]);

const router = createRouter({ routes: [root], viewTransitions: true });
const app = router.mount(document.getElementById("app")!);

await router.navigate({ to: "/users/$id", params: { id: 7 }, search: { page: 2 } });
```

Configure JSX with `jsx: "react-jsx"` and `jsxImportSource: "@hedystia/view"`. Components run once per matched route identity; read `params()`, `search()` and `data()` inside accessors to update without replacing a shared layout. Dispose the mounted app when its owner is removed.

`router.href()` and `router.Link()` use the same typed destinations, required params and validated search fields as `navigate()`. `router.match("/users/$id")?.data` retains that route's loader type. Paths use `$name` parameters and a final `$` splat, exposed as `_splat`; params are decoded strings in loaders and accept strings or numbers in navigation inputs.

## Nested layouts and indexes

Paths are absolute within the router, including nested routes. Use `addChildren()` to declare hierarchy. A pathless `createLayout("unique-id")` consumes no URL segment. For a `/users` parent, `/users/` is its index child and `/users/$id` is its dynamic child. Static routes rank before params and splats. Layout IDs and route paths must be unique. Type inference supports up to twelve nested definition levels.

## Generated file routes

```ts
import { defineConfig } from "vite";
import { viewPlugin } from "@hedystia/view/vite";
import { routerPlugin } from "@hedystia/router/vite";

export default defineConfig({
  plugins: [...viewPlugin().plugins, routerPlugin()],
});
```

Each route module exports `Route`, using the code-route API. The plugin generates `src/routeTree.gen.ts` before a build and updates it when files are added or removed. Import its `routeTree` into `createRouter({ routes: routeTree })`.

| File | Declared path |
| --- | --- |
| `src/routes/__root.tsx` | `createLayout("root", ...)` |
| `src/routes/index.tsx` | `/` |
| `src/routes/users.tsx` | `/users` |
| `src/routes/users/index.tsx` | `/users/` |
| `src/routes/users/$id.tsx` | `/users/$id` |
| `src/routes/users/_layout.tsx` | A uniquely named pathless layout |

Dotted filenames such as `users.$id.tsx` also work. Prefix ignored modules with `-`; test/spec/declaration files are excluded. Generated imports are lazy, so unmatched route modules stay out of the initial application bundle. Declared paths must match filenames; TypeScript checks mismatches instead of rewriting your source. Existing handwritten output files are never overwritten. For generation before a standalone type check, call `generateRoutes()` from `@hedystia/router/vite` in a build script.

## Loading and cache policy

Search is untrusted. A synchronous `validateSearch` returns the route's typed search object or throws. `beforeLoad` guards run from parent to child before loaders start. Matched route modules, component imports and independent loaders load concurrently where their dependencies permit.

Loader keys include route identity, decoded params and validated search, or the result of `loaderDeps(search)`. Dependencies must be finite JSON values. Forward the loader's supplied `signal` to fetch. Preloading and navigation share requests; abandoning one consumer does not abort another consumer's work. Superseded navigation cannot commit late results. Cancelling navigation restores the last committed state and clears the busy indicator; invalid destinations do not cancel existing work.

- Normal navigation defaults to `staleTime: 0`.
- Preloaded data defaults to `preloadStaleTime: 30000` and is reused for the next navigation while fresh.
- Both values can be set on the router or an individual route.
- `router.preload(options)` warms a destination without changing the URL.
- `router.invalidate()` invalidates loader data and reloads the current location.
- Query bounds inactive entries by access order; there is no timer-based garbage collector or automatic polling.

## Errors, redirects and missing data

```ts
import { notFound, redirect } from "@hedystia/router";

const privateRoute = createRoute("/private", {
  beforeLoad: async () => {
    if (!await hasSession()) throw redirect("/login");
  },
  loader: async ({ signal }) => {
    const response = await fetch("/api/private", { signal });
    if (response.status === 404) throw notFound();
    if (!response.ok) throw new Error("Request failed");
    return response.json();
  },
});
```

Route `errorComponent` handlers receive `{ error, retry }`; ancestor handlers can catch descendant loading failures. Router-level `errorComponent`, `notFoundComponent` and `pendingComponent` supply fallbacks. Previously committed content stays visible during loading. Redirects are restricted to the router's origin and base path and stop after ten hops.

## Browser navigation and SSR

`mount()` installs listeners only for the supplied root. Modified clicks, downloads, other targets, external origins and explicit opt-outs keep normal anchor behavior. History navigation restores entry-specific scroll positions. A committed route focuses `[data-router-focus]`, its first heading or its main element. `viewTransitions: true` uses the native API when available and respects reduced motion.

For SSR, create a new router per request, provide `initialUrl`, await `router.load()`, then render `<RouterView router={router} />` with View's server renderer. Do not share a personalized router/cache across users.

This is a TanStack-inspired View router, not a drop-in TanStack API. Optional path segments, relative `from` navigation, automatic context/search inheritance, deferred streaming, global route registration and devtools are not provided. Use Astro's page navigation or a View SPA router for a given root, not both. Astro static pages do not need this router's browser runtime.

[Documentation](https://docs.hedystia.com/client/router) · MIT
