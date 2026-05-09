# @hedystia/ws

Universal WebSocket primitives for [Hedystia](https://docs.hedystia.com).

The package ships **no HTTP server**. It only exposes WebSocket pieces that
work the same way on **Bun**, **Node.js** and **Deno**:

- A runtime-aware **client constructor**.
- A portable **`WebSocketServer`** that consumes raw HTTP upgrade tuples
  and offers topic-based pub/sub, mirroring `Bun.ServerWebSocket`.
- Shared **types** and **runtime detection** helpers.

The HTTP layer (Bun.serve / `node:http`) is intentionally left to the
caller (`hedystia` server uses it internally).

## Install

```bash
bun add @hedystia/ws
# or
npm install @hedystia/ws
```

## Client

```ts
import { createWebSocket } from "@hedystia/ws/client";

const ws = createWebSocket("ws://localhost:3000", {
  headers: { authorization: "Bearer ..." },
});

ws.onopen = () => ws.send("hi");
ws.onmessage = (event) => console.log(event.data);
```

`createWebSocket()` uses `globalThis.WebSocket` when available (Bun, Deno,
browsers, Node ≥ 22) and falls back to the [`ws`](https://github.com/websockets/ws)
package on older Node releases. Custom request headers are honoured on Node
and ignored elsewhere — matching WHATWG semantics.

A small ergonomic wrapper is also provided:

```ts
import { WebSocketClient } from "@hedystia/ws/client";

const client = new WebSocketClient("ws://localhost:3000");
client.onmessage = (e) => console.log(e.data);
```

## Server

The `WebSocketServer` does **not** open a port. Plug it into any HTTP
runtime that exposes raw upgrade tuples (`req`, `socket`, `head`).

```ts
import { createServer } from "node:http";
import { WebSocketServer } from "@hedystia/ws/server";

const wss = new WebSocketServer({
  open: (ws) => ws.send("welcome"),
  message: (ws, message) => ws.publish("room", message),
});

const http = createServer((_req, res) => res.end("ok"));

http.on("upgrade", (req, socket, head) => {
  wss.upgrade({ rawRequest: req, socket, head }, { data: { user: "anon" } });
});

http.listen(3000);

// Broadcast from anywhere
wss.publish("room", "hello world");
```

The wrapper exposed to handlers implements:

| Method | Behaviour |
|--------|-----------|
| `ws.send(msg)` | Send to a single socket |
| `ws.subscribe(topic)` | Join a topic |
| `ws.unsubscribe(topic)` | Leave a topic |
| `ws.publish(topic, msg)` | Broadcast to peers (excluding self) |
| `ws.isSubscribed(topic)` | Membership check |
| `ws.close(code, reason)` | Close the connection |
| `ws.cork(cb)` | No-op alias for batching writes |
| `ws.data` | User-supplied state attached on upgrade |

## Runtime detection

```ts
import { detectRuntime, isBun, isNode, isDeno } from "@hedystia/ws";

if (detectRuntime() === "bun") {
  // ...
}
```

## License

MIT
