# @hedystia/ws

Universal WebSocket primitives for Hedystia on Bun, Node.js, and Deno.

## Install

```bash
pnpm add @hedystia/ws
```

## Server

```ts
import { serve } from "@hedystia/ws";

const server = await serve({
  open: (ws) => ws.subscribe("global"),
  message: (ws, message) => ws.publish("global", message),
});

server.publish("global", "hello");
await server.stop(true);
```

For an existing Node HTTP server, use `WebSocketServer.upgrade()` with the
raw `{ rawRequest, socket, head }` upgrade tuple. `WebSocketRequest` is a
structural request type used by `resolveData`, so runtime-specific request
objects can be passed without importing Node or Bun types.

### Socket API

| Method | Behavior |
| --- | --- |
| `send(message)` | Send text or binary data to this socket |
| `subscribe(topic)` | Join a topic |
| `unsubscribe(topic)` | Leave a topic |
| `publish(topic, message)` | Broadcast to peers, excluding the sender |
| `isSubscribed(topic)` | Check topic membership |
| `close(code, reason)` | Start the close handshake |
| `cork(callback)` | Invoke the callback with this socket |
| `data` | User-attached connection state |

The server enforces `maxPayload`, handles fragmentation and ping/pong frames,
and reports lifecycle errors through the optional `error` callback.

## Client

```ts
import { createWebSocket, WebSocketClient } from "@hedystia/ws/client";

const ws = createWebSocket("ws://localhost:3000", { protocols: "v1" });
ws.onopen = () => ws.send("hello");

const client = new WebSocketClient("ws://localhost:3000");
client.onmessage = (event) => console.log(event.data);
```

The client uses the runtime's native WHATWG `WebSocket`. Browser-compatible
constructors do not allow arbitrary HTTP headers; `ClientWebSocketOptions.headers`
is therefore reserved for runtimes that explicitly support custom headers and
is not applied in browsers or standard Node/Deno WebSocket implementations.

## Runtime detection

```ts
import { detectRuntime, isBun, isNode, isDeno } from "@hedystia/ws";
```

## Documentation

- [WebSocket documentation](https://docs.hedystia.com/websocket/start)
- [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455)

MIT License © 2026 Hedystia
