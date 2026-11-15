# @hedystia/client

## A typed client you can test without a server

Pass `fetch` to `createClient(baseUrl, { fetch })` to use an in-memory app, instrumentation or a test transport. Pass `{ signal: controller.signal }` per HTTP request to cancel it. Dynamic path values are URL-encoded as individual segments; pass decoded values, not pre-encoded paths.

```sh
npm install @hedystia/client
```

## Usage

```ts
import { createClient } from "@hedystia/client";
import type { app } from "./server";

const client = createClient<typeof app>("https://api.example.com");
const controller = new AbortController();
const request = client.users.get({ signal: controller.signal });
controller.abort();
const { data, error, status, ok } = await request;
```

Cancellation and network failures return `{ data: null, error, status: 0, ok: false }`. HTTP failures retain their actual status. To test without listening on a socket, inject a Fetch-compatible transport:

```ts
const client = createClient<typeof app>("http://localhost", {
  fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
});
```

HTTP request options include `body`, `query`, `headers`, `credentials`, `signal` and `responseFormat`, subject to each route's inferred contract. SSE and WebSocket subscriptions use their own lifecycle controls.

[Documentation](https://docs.hedystia.com) · [Source](https://github.com/Hedystia/Hedystia) · MIT
