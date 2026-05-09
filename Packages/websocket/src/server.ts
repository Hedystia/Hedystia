/**
 * Portable WebSocket server primitive.
 *
 * @packageDocumentation
 */

import { type WebSocket as NodeWebSocket, WebSocketServer as WSServer } from "ws";

import type {
  ServerWebSocket,
  UpgradeOptions,
  UpgradeRequest,
  WebSocketHandlers,
  WebSocketServerOptions,
  WSData,
  WSMessage,
} from "./types";

export type {
  ServerWebSocket,
  UpgradeOptions,
  UpgradeRequest,
  WebSocketHandlers,
  WebSocketServerOptions,
  WSData,
  WSMessage,
} from "./types";

/**
 * Runtime-agnostic WebSocket server.
 *
 * @remarks
 * Internally backed by the [`ws`](https://github.com/websockets/ws) package
 * which runs on Bun, Node.js and Deno (via `npm:` specifiers). The class
 * does **not** create or own an HTTP server — callers feed it raw upgrade
 * tuples coming from any HTTP runtime they prefer.
 *
 * It implements topic-based pub/sub on top of the per-connection
 * `subscribe` / `unsubscribe` / `publish` API expected by Hedystia,
 * matching the shape of `Bun.ServerWebSocket`.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 *
 * @example
 * ```ts
 * import { createServer } from "node:http";
 * import { WebSocketServer } from "@hedystia/ws/server";
 *
 * const wss = new WebSocketServer({
 *   open: (ws) => ws.send("welcome"),
 *   message: (ws, msg) => ws.publish("room", msg),
 * });
 *
 * const http = createServer((_req, res) => res.end("ok"));
 * http.on("upgrade", (req, socket, head) => {
 *   wss.upgrade({ rawRequest: req, socket, head }, { data: { user: "anon" } });
 * });
 * http.listen(3000);
 * ```
 */
export class WebSocketServer<Data extends WSData = WSData> {
  private readonly handlers: WebSocketHandlers<Data>;
  private readonly wss: WSServer;
  private readonly topics = new Map<string, Set<NodeWebSocket>>();
  private readonly socketTopics = new WeakMap<NodeWebSocket, Set<string>>();
  private readonly allSockets = new Set<NodeWebSocket>();

  /**
   * Build a new WebSocket server.
   *
   * @param handlers - Lifecycle handlers ({@link WebSocketHandlers})
   * @param options - Optional behavioural overrides ({@link WebSocketServerOptions})
   *
   * @example
   * ```ts
   * const wss = new WebSocketServer(
   *   { message: (ws, msg) => ws.send(msg) },
   *   { maxPayload: 1024 * 1024 },
   * );
   * ```
   */
  constructor(handlers: WebSocketHandlers<Data>, options: WebSocketServerOptions = {}) {
    this.handlers = handlers;
    this.wss = new WSServer({
      noServer: true,
      maxPayload: options.maxPayload,
      perMessageDeflate: (options.perMessageDeflate ?? false) as any,
    });
  }

  /**
   * Upgrade a raw HTTP upgrade tuple to a WebSocket connection.
   *
   * @remarks
   * The returned promise resolves to the connected {@link ServerWebSocket}
   * once the handshake completes; rejection means the handshake failed.
   *
   * @param req - Upgrade tuple emitted by `node:http`'s `'upgrade'` event
   * @param options - Optional initial `data` for the new connection
   * @returns Promise that resolves with the established socket wrapper
   *
   * @throws {Error} When the underlying handshake throws synchronously
   *
   * @example
   * ```ts
   * http.on("upgrade", async (req, socket, head) => {
   *   try {
   *     await wss.upgrade({ rawRequest: req, socket, head });
   *   } catch (err) {
   *     console.error("Upgrade failed", err);
   *     socket.destroy();
   *   }
   * });
   * ```
   */
  upgrade(req: UpgradeRequest, options?: UpgradeOptions<Data>): Promise<ServerWebSocket<Data>> {
    return new Promise((resolve, reject) => {
      try {
        this.wss.handleUpgrade(req.rawRequest, req.socket, req.head as Buffer, (socket) => {
          const data = (options?.data ?? ({} as Data)) as Data;
          const wrapped = this.wrap(socket, data, req.rawRequest);
          this.bind(socket, wrapped);
          resolve(wrapped);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Publish a message to all sockets currently subscribed to `topic`.
   *
   * @param topic - Topic name
   * @param message - Payload to broadcast
   * @param _compress - Reserved for future use; ignored under the `ws` adapter
   * @returns Number of sockets that received the message.
   *
   * @example
   * ```ts
   * wss.publish("room", JSON.stringify({ kind: "ping" }));
   * ```
   */
  publish(topic: string, message: WSMessage, _compress?: boolean): number {
    const set = this.topics.get(topic);
    if (!set || set.size === 0) {
      return 0;
    }
    const payload = toSendable(message);
    let count = 0;
    for (const socket of set) {
      if (socket.readyState === 1) {
        socket.send(payload);
        count++;
      }
    }
    return count;
  }

  /**
   * Close the server and optionally terminate all live sockets.
   *
   * @param closeActiveConnections - When `true`, calls `socket.terminate()`
   *  on every live connection before shutting down.
   */
  close(closeActiveConnections = false): void {
    if (closeActiveConnections) {
      for (const socket of this.allSockets) {
        try {
          socket.terminate();
        } catch {
          /* ignore */
        }
      }
      this.allSockets.clear();
    }
    this.wss.close();
  }

  /**
   * Attach the per-socket lifecycle listeners (`message`, `close`, `error`).
   *
   * @internal
   */
  private bind(socket: NodeWebSocket, wrapped: ServerWebSocket<Data>): void {
    this.allSockets.add(socket);

    if (this.handlers.open) {
      Promise.resolve(this.handlers.open(wrapped)).catch((err) =>
        console.error("[ws] open handler error:", err),
      );
    }

    socket.on("message", (raw, isBinary) => {
      const message: WSMessage = isBinary
        ? raw instanceof ArrayBuffer
          ? new Uint8Array(raw)
          : Array.isArray(raw)
            ? Buffer.concat(raw)
            : (raw as Buffer)
        : raw.toString();
      Promise.resolve(this.handlers.message(wrapped, message)).catch((err) =>
        console.error("[ws] message handler error:", err),
      );
    });

    socket.on("close", (code, reason) => {
      const owned = this.socketTopics.get(socket);
      if (owned) {
        for (const topic of owned) {
          this.topics.get(topic)?.delete(socket);
        }
        this.socketTopics.delete(socket);
      }
      this.allSockets.delete(socket);
      if (this.handlers.close) {
        Promise.resolve(this.handlers.close(wrapped, code, reason?.toString() ?? "")).catch((err) =>
          console.error("[ws] close handler error:", err),
        );
      }
    });

    socket.on("error", (err) => {
      if (this.handlers.error) {
        Promise.resolve(this.handlers.error(wrapped, err)).catch((e) =>
          console.error("[ws] error handler error:", e),
        );
      }
    });
  }

  /**
   * Build the {@link ServerWebSocket} wrapper exposed to user handlers.
   *
   * @internal
   */
  private wrap(socket: NodeWebSocket, data: Data, rawReq: any): ServerWebSocket<Data> {
    const remoteAddress: string =
      (rawReq?.socket?.remoteAddress as string) ||
      (rawReq?.headers?.["x-forwarded-for"] as string) ||
      "";

    const subscribe = (topic: string) => {
      let set = this.topics.get(topic);
      if (!set) {
        set = new Set();
        this.topics.set(topic, set);
      }
      set.add(socket);
      let owned = this.socketTopics.get(socket);
      if (!owned) {
        owned = new Set();
        this.socketTopics.set(socket, owned);
      }
      owned.add(topic);
    };

    const unsubscribe = (topic: string) => {
      this.topics.get(topic)?.delete(socket);
      this.socketTopics.get(socket)?.delete(topic);
    };

    const publishToPeers = (topic: string, message: WSMessage) => {
      const set = this.topics.get(topic);
      if (!set) {
        return;
      }
      const payload = toSendable(message);
      for (const peer of set) {
        if (peer !== socket && peer.readyState === 1) {
          peer.send(payload);
        }
      }
    };

    const wrapper: ServerWebSocket<Data> = {
      data,
      get readyState() {
        return socket.readyState;
      },
      remoteAddress,
      send: (message, _compress) => {
        const payload = toSendable(message);
        socket.send(payload);
        return typeof payload === "string"
          ? Buffer.byteLength(payload)
          : (payload as Buffer | Uint8Array).byteLength;
      },
      close: (code, reason) => {
        socket.close(code, reason);
      },
      subscribe,
      unsubscribe,
      publish: publishToPeers,
      isSubscribed: (topic) => !!this.socketTopics.get(socket)?.has(topic),
      cork: (cb) => cb(wrapper),
    };

    return wrapper;
  }
}

/**
 * Coerce a {@link WSMessage} into something the `ws` package can transmit.
 *
 * @param message - User-supplied payload
 * @returns A `string`, `Buffer` or `Uint8Array` ready to be sent
 *
 * @internal
 */
function toSendable(message: WSMessage): string | Buffer | Uint8Array {
  if (typeof message === "string") {
    return message;
  }
  if (message instanceof ArrayBuffer) {
    return Buffer.from(message);
  }
  return message;
}
