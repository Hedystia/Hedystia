# @hedystia/ws

Universal WebSocket primitives for [Hedystia](https://docs.hedystia.com).

Works on **Bun**, **Node.js** and **Deno** with a single API.

## Install

```bash
bun add @hedystia/ws
# or
npm install @hedystia/ws
```

## Server

### `serve()` — standalone (recommended)

Auto-detects the runtime and starts a full HTTP+WebSocket server:

```ts
import { serve } from "@hedystia/ws";

const server = await serve({
  open: (ws) => ws.subscribe("global"),
  message: (ws, msg) => ws.publish("global", msg),
});

console.log(`Listening on ${server.url}`);
// Broadcast from anywhere
server.publish("global", "hello everyone");
await server.stop();
```

- **Bun:** delegates to `Bun.serve()` with native WebSocket.
- **Node/Deno:** creates a `node:http` server with the built-in upgrade handler.

### `WebSocketServer` — low-level

Does **not** open a port. Plug it into any HTTP runtime that exposes raw
upgrade tuples (`req`, `socket`, `head`).

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

### Socket API (both modes)

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

## Client

```ts
import { createWebSocket } from "@hedystia/ws/client";

const ws = createWebSocket("ws://localhost:3000", {
  headers: { authorization: "Bearer ..." },
});

ws.onopen = () => ws.send("hi");
ws.onmessage = (event) => console.log(event.data);
```

A small ergonomic wrapper is also provided:

```ts
import { WebSocketClient } from "@hedystia/ws/client";

const client = new WebSocketClient("ws://localhost:3000");
client.onmessage = (e) => console.log(e.data);
```

## Runtime detection

```ts
import { detectRuntime, isBun, isNode, isDeno } from "@hedystia/ws";

if (detectRuntime() === "bun") {
  // ...
}
```

## License

MIT
