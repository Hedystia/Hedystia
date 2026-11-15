# @hedystia/query

Reactive query caching and mutation invalidation built on `@hedystia/view`. No third-party runtime dependencies.

```sh
npm install @hedystia/query
```

## Reactive queries

```ts
import { createQueryClient } from "@hedystia/query";
import { sig, val } from "@hedystia/view";

const queries = createQueryClient();
const userId = sig(1);

const user = queries.query(
  () => ["users", val(userId)] as const,
  async (key, signal) => {
    const response = await fetch(`/api/users/${key[1]}`, { signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json() as Promise<{ id: number; name: string }>;
  },
);
```

Create reactive queries inside a View component or `createRoot` so disposal releases subscriptions. Read `user()`, `user.data()`, `user.loading()`, `user.error()`, `user.state()` and `user.ready`. Changing the key cancels that consumer's old request; another consumer of the same key can keep its shared request alive.

## Mutations and invalidation

```ts
const renameUser = queries.mutation(
  async (name: string) => {
    const response = await fetch("/api/users/1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error(`Update failed: ${response.status}`);
    return response.json();
  },
  { invalidate: [["users"]] },
);

await renameUser.run("Alice");
queries.invalidate(["users", 1]);
```

Successful mutations invalidate the configured prefixes and refetch mounted queries. Failed mutations preserve cached data. Mutations reuse View actions: call the mutation directly or use `.run()`. Concurrent actions keep loading true until all calls settle, while the latest-started call owns the exposed data and error.

## Imperative access

```ts
const controller = new AbortController();
const value = await queries.fetchQuery(["health"], async (signal) => {
  const response = await fetch("/health", { signal });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.text();
}, controller.signal);
```

## Cache contract

- Keys are arrays of finite, acyclic JSON values. Plain object key order does not affect identity. Undefined, sparse arrays, symbols, functions, BigInts and class instances are rejected.
- Concurrent consumers of one key share one request. Use one consistent result type and fetcher contract for each key.
- Results, including `undefined`, remain fresh until explicit invalidation or eviction. There are no timers, background polling, retries or persistent storage.
- Prefix matching is structural: `["users"]` matches `["users", 1]`, but `["user"]` does not.
- Disposing or cancelling the last consumer aborts its shared request. Superseded requests cannot overwrite newer cached values, even if the fetcher ignores cancellation.
- The cache retains at most 128 entries when none are observed or in flight. Mounted queries and active requests are retained until released; unused entries are evicted in access order.
- Create one client per server request when rendering personalized pages. Cached values are shared by reference within a client; do not share a client across unrelated users.

Use any async fetcher, including a typed `@hedystia/client` call. Forward the supplied signal, check the client's `ok` result, and throw its error on failure so unsuccessful responses are not cached as successful data.

[Documentation](https://docs.hedystia.com/client/query) · MIT
