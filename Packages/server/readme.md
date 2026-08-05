# Hedystia server

A runtime-agnostic TypeScript HTTP framework with validation, typed routes,
subscriptions, and WebSocket support.

## Quick start

```ts
import Hedystia, { h } from "hedystia";

const app = new Hedystia()
  .get("/hello/:name", (ctx) => ({ hello: ctx.params.name }), {
    params: h.object({ name: h.string() }),
    response: h.object({ hello: h.string() }),
  });

app.listen(3000);
```

## Router behavior

Routes are matched in this order:

1. Static segments (`/users/new`).
2. Parameter segments (`/users/:id`).
3. Wildcards (`/files/*path`).

Trailing slashes are normalized. Parameter and wildcard values are decoded
with `decodeURIComponent`; malformed escape sequences are preserved instead
of crashing the request. Wildcards capture the remaining path joined by `/`.

## Validation and async handlers

Route schemas use `@hedystia/validations`. Handlers and lifecycle hooks may be
sync or async. Schema validation failures produce a `400` response before the
handler runs. Use `h.default()` for values generated when an input is missing.

## WebSocket and subscriptions

```ts
app.ws("/chat", {
  open: (ws) => ws.send("connected"),
  message: (ws, message) => ws.send(message),
});

app.subscription("/events", () => ({ ready: true }), {
  params: h.object({ id: h.string() }),
  summary: "Event stream",
});
```

The server keeps HTTP, WebSocket, and subscription route registries separate.
The `@hedystia/swagger` plugin documents realtime routes with
`x-hedystia-websocket` and `x-hedystia-subscription` OpenAPI extensions.

## Production notes

- Use the runtime adapter appropriate for Bun, Node.js, or another supported
  server environment.
- Configure CORS and headers explicitly for public APIs.
- Add route tests for static/parameter/wildcard precedence and encoded values.

## Documentation

- [Framework documentation](https://docs.hedystia.com)
- [Getting started](https://docs.hedystia.com/framework/getting-started)
- [API reference](https://docs.hedystia.com/framework/overview)

MIT License © 2026 Hedystia
