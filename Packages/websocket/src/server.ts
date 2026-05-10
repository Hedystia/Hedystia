import { createHash } from "node:crypto";
import type { Duplex } from "node:stream";

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
 * WebSocket magic GUID defined in RFC 6455 section 4.2.2.
 *
 * @internal
 */
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const OP_CONTINUATION = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

/**
 * Compute the `Sec-WebSocket-Accept` response header per RFC 6455 §4.2.2.
 *
 * @param clientKey - Value of the `Sec-WebSocket-Key` request header
 * @returns Base-64 encoded SHA-1 digest
 *
 * @internal
 */
function computeAccept(clientKey: string): string {
  return createHash("sha1")
    .update(clientKey + WS_GUID)
    .digest("base64");
}

/**
 * Write a single unmasked (server-to-client) WebSocket data frame to a raw
 * duplex socket per RFC 6455 §5.2.
 *
 * @param socket  - Underlying duplex transport
 * @param opcode  - WebSocket opcode (text, binary, close, ping, pong …)
 * @param payload - Payload bytes to encapsulate
 *
 * @internal
 */
function writeFrame(socket: Duplex, opcode: number, payload: Buffer): void {
  const len = payload.length;
  let header: Buffer;

  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 0x10000) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len >>> 0, 6);
  }

  if (payload.length === 0) {
    socket.write(header);
  } else {
    socket.write(Buffer.concat([header, payload]));
  }
}

/**
 * Incremental streaming RFC 6455 frame parser for masked client→server frames.
 * Handles fragmentation, ping/pong, and close frames internally.
 *
 * @internal
 */
class FrameParser {
  private buf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentOpcode = 0;
  private readonly maxPayload: number;

  /** Callback fired when a complete data frame is assembled. */
  onMessage?: (data: Buffer | string, isBinary: boolean) => void;
  /** Callback fired when a close frame is received. */
  onClose?: (code: number, reason: string) => void;
  /** Callback fired when a ping frame is received. */
  onPing?: (data: Buffer) => void;
  /** Callback fired on parse errors or protocol violations. */
  onError?: (err: Error) => void;

  /**
   * @param maxPayload - Maximum allowed frame payload in bytes (default 100 MiB)
   */
  constructor(maxPayload = 100 * 1024 * 1024) {
    this.maxPayload = maxPayload;
  }

  /**
   * Feed a new chunk of raw socket data into the parser.
   *
   * @param chunk - Incoming bytes from the transport
   */
  push(chunk: Buffer): void {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    this.drain();
  }

  /**
   * Consume as many complete frames as possible from the internal buffer.
   *
   * @internal
   */
  private drain(): void {
    for (;;) {
      if (this.buf.length < 2) {
        return;
      }

      const b0 = this.buf[0]!;
      const b1 = this.buf[1]!;
      const fin = (b0 & 0x80) !== 0;
      const rsv = b0 & 0x70;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (rsv !== 0) {
        this.onError?.(new Error("WebSocket: RSV bits must be 0 (no extensions negotiated)"));
        return;
      }

      if (payloadLen === 126) {
        if (this.buf.length < 4) {
          return;
        }
        payloadLen = this.buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buf.length < 10) {
          return;
        }
        const hi = this.buf.readUInt32BE(2);
        const lo = this.buf.readUInt32BE(6);
        payloadLen = hi * 0x1_0000_0000 + lo;
        offset = 10;
      }

      if (payloadLen > this.maxPayload) {
        this.onError?.(
          new Error(
            `WebSocket: payload length ${payloadLen} exceeds maxPayload ${this.maxPayload}`,
          ),
        );
        return;
      }

      const maskLen = masked ? 4 : 0;
      const frameEnd = offset + maskLen + payloadLen;
      if (this.buf.length < frameEnd) {
        return;
      }

      let payload: Buffer;
      if (masked) {
        const mask = this.buf.subarray(offset, offset + 4);
        payload = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = this.buf[offset + 4 + i]! ^ mask[i & 3]!;
        }
      } else {
        payload = Buffer.from(this.buf.subarray(offset, frameEnd));
      }

      this.buf = this.buf.subarray(frameEnd);
      this.handleFrame(fin, opcode, payload);
    }
  }

  /**
   * Route a parsed frame to the appropriate callback based on opcode.
   *
   * @param fin     - Whether this is the final fragment
   * @param opcode  - WebSocket frame opcode
   * @param payload - Unmasked payload bytes
   *
   * @internal
   */
  private handleFrame(fin: boolean, opcode: number, payload: Buffer): void {
    switch (opcode) {
      case OP_PING:
        this.onPing?.(payload);
        return;

      case OP_PONG:
        return;

      case OP_CLOSE: {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
        const reason = payload.length > 2 ? payload.subarray(2).toString("utf8") : "";
        this.onClose?.(code, reason);
        return;
      }

      case OP_CONTINUATION:
      case OP_TEXT:
      case OP_BINARY:
        if (opcode !== OP_CONTINUATION) {
          this.fragmentOpcode = opcode;
        }
        this.fragments.push(payload);
        if (fin) {
          const full = Buffer.concat(this.fragments);
          this.fragments = [];
          const isBinary = this.fragmentOpcode === OP_BINARY;
          this.onMessage?.(isBinary ? full : full.toString("utf8"), isBinary);
        }
        return;

      default:
        this.onError?.(new Error(`WebSocket: unknown opcode 0x${opcode.toString(16)}`));
    }
  }
}

/**
 * Thin wrapper around a raw `Duplex` that exposes a minimal frame-aware
 * WebSocket interface used internally by {@link WebSocketServer}.
 *
 * @internal
 */
class NativeSocket {
  /** Underlying duplex transport stream. */
  readonly duplex: Duplex;
  /** Incremental frame parser attached to this transport. */
  readonly parser: FrameParser;

  /** WHATWG-compatible ready-state: `1` open · `2` closing · `3` closed. */
  readyState: 1 | 2 | 3 = 1;

  /**
   * @param duplex     - Raw duplex transport
   * @param maxPayload - Maximum allowed payload in bytes
   */
  constructor(duplex: Duplex, maxPayload?: number) {
    this.duplex = duplex;
    this.parser = new FrameParser(maxPayload);
  }

  /**
   * Send a data frame to the peer.
   *
   * @param data - Payload to transmit
   */
  send(data: string | Buffer | Uint8Array): void {
    if (this.readyState !== 1) {
      return;
    }
    const isBuf = Buffer.isBuffer(data);
    const buf =
      typeof data === "string"
        ? Buffer.from(data, "utf8")
        : isBuf
          ? data
          : Buffer.from(data as Uint8Array);
    writeFrame(this.duplex, typeof data === "string" ? OP_TEXT : OP_BINARY, buf);
  }

  /**
   * Initiate the close handshake.
   *
   * @param code   - Close status code (default `1000`)
   * @param reason - Optional UTF-8 reason phrase
   */
  close(code = 1000, reason = ""): void {
    if (this.readyState !== 1) {
      return;
    }
    this.readyState = 2;
    const reasonBuf = Buffer.from(reason, "utf8");
    const payload = Buffer.allocUnsafe(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    writeFrame(this.duplex, OP_CLOSE, payload);
  }

  /**
   * Hard-terminate the underlying transport without a close handshake.
   */
  terminate(): void {
    this.readyState = 3;
    this.duplex.destroy();
  }
}

/**
 * Runtime-agnostic WebSocket server built entirely on Node.js built-ins
 * (`node:crypto`, `node:stream`) — no third-party dependencies.
 *
 * @remarks
 * The class does **not** create or own an HTTP server. Callers feed it raw
 * upgrade tuples coming from any HTTP runtime (Node.js `http`, Bun, Deno,
 * Hono, Fastify's upgrade hook, etc.).
 *
 * Topic-based pub/sub is implemented in user-space, matching the shape of
 * `Bun.ServerWebSocket` so the same handler code runs on every runtime.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 *
 * @example
 * ```ts
 * import { createServer } from "node:http";
 * import { WebSocketServer } from "@hedystia/ws/server";
 *
 * const wss = new WebSocketServer({
 *   open:    (ws) => ws.send("welcome"),
 *   message: (ws, msg) => ws.publish("room", msg),
 *   close:   (ws, code) => console.log("closed", code),
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
  private readonly maxPayload: number | undefined;
  private readonly resolveData: ((req: any) => Record<string, any>) | undefined;
  private readonly topics = new Map<string, Set<any>>();
  private readonly socketTopics = new WeakMap<object, Set<string>>();
  private readonly allSockets = new Set<any>();

  /**
   * Build a new WebSocket server.
   *
   * @param handlers - Lifecycle handlers ({@link WebSocketHandlers})
   * @param options  - Optional behavioural overrides ({@link WebSocketServerOptions})
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
    this.maxPayload = options.maxPayload;
    this.resolveData = options.resolveData;
  }

  /**
   * Upgrade a raw HTTP upgrade tuple to a WebSocket connection.
   *
   * @remarks
   * Performs the RFC 6455 handshake synchronously on the duplex socket,
   * then wires up frame parsing and lifecycle handlers. The returned
   * promise resolves to the {@link ServerWebSocket} wrapper immediately
   * after the handshake bytes are written.
   *
   * @param req     - Upgrade tuple emitted by `node:http`'s `'upgrade'` event
   * @param options - Optional initial `data` for the new connection
   * @returns Promise that resolves with the established socket wrapper
   *
   * @throws {Error} When `Sec-WebSocket-Key` is absent from the request headers
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
        const rawReq = req.rawRequest;
        const duplex = req.socket as Duplex;

        const clientKey = rawReq.headers?.["sec-websocket-key"] as string | undefined;
        if (!clientKey) {
          duplex.destroy();
          return reject(new Error("WebSocket upgrade: missing Sec-WebSocket-Key header"));
        }

        const accept = computeAccept(clientKey);
        const rawProtocol = rawReq.headers?.["sec-websocket-protocol"] as string | undefined;
        const protocol = rawProtocol?.split(",")[0]?.trim();

        let response =
          "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${accept}\r\n`;

        if (protocol) {
          response += `Sec-WebSocket-Protocol: ${protocol}\r\n`;
        }
        response += "\r\n";
        duplex.write(response);

        const native = new NativeSocket(duplex, this.maxPayload);
        const data = (options?.data ?? {}) as Data;
        const wrapped = this.wrap(native, data, rawReq);
        this.bind(native, wrapped, req.head);

        resolve(wrapped);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Publish a message to all sockets currently subscribed to `topic`.
   *
   * @param topic      - Topic name
   * @param message    - Payload to broadcast
   * @param _compress  - Reserved for future use
   * @returns Number of sockets that received the message
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
    for (const native of set) {
      if (native.readyState === 1) {
        native.send(payload);
        count++;
      }
    }
    return count;
  }

  /**
   * Close the server and optionally terminate all live sockets.
   *
   * @param closeActiveConnections - When `true`, immediately terminates
   *   every live connection before clearing internal state
   */
  close(closeActiveConnections = false): void {
    if (closeActiveConnections) {
      for (const native of this.allSockets) {
        try {
          if (typeof (native as any).terminate === "function") {
            (native as any).terminate();
          } else if (typeof (native as any).close === "function") {
            (native as any).close(1001, "Server shutdown");
          }
        } catch {
          /* ignore */
        }
      }
      this.allSockets.clear();
    }
    this.topics.clear();
  }

  /**
   * Wire up the duplex transport listeners (`data`, `close`, `error`) and
   * invoke the user's `open` handler.
   *
   * @param native  - Wrapped transport socket
   * @param wrapped - Public {@link ServerWebSocket} wrapper
   * @param head    - Buffered bytes captured by the HTTP parser (re-fed into the parser)
   *
   * @internal
   */
  private bind(
    native: NativeSocket,
    wrapped: ServerWebSocket<Data>,
    head: Buffer | Uint8Array,
  ): void {
    this.allSockets.add(native);

    if (head && head.length > 0) {
      native.parser.push(Buffer.isBuffer(head) ? head : Buffer.from(head));
    }

    native.parser.onMessage = (raw, isBinary) => {
      const message: WSMessage = isBinary
        ? raw instanceof Buffer
          ? raw
          : Buffer.from(raw as Uint8Array)
        : (raw as string);
      Promise.resolve(this.handlers.message(wrapped, message)).catch((err) =>
        console.error("[ws] message handler error:", err),
      );
    };

    native.parser.onClose = (code, reason) => {
      if (native.readyState === 1) {
        native.close(code, reason);
      }
      this.cleanup(native);
      if (this.handlers.close) {
        Promise.resolve(this.handlers.close(wrapped, code, reason)).catch((err) =>
          console.error("[ws] close handler error:", err),
        );
      }
    };

    native.parser.onPing = (data) => {
      if (native.readyState === 1) {
        writeFrame(native.duplex, OP_PONG, data);
      }
    };

    native.parser.onError = (err) => {
      native.terminate();
      this.cleanup(native);
      if (this.handlers.error) {
        Promise.resolve(this.handlers.error(wrapped, err)).catch((e) =>
          console.error("[ws] error handler error:", e),
        );
      }
    };

    native.duplex.on("data", (chunk: Buffer) => {
      try {
        native.parser.push(chunk);
      } catch (err) {
        console.error("[ws] frame parsing error:", err);
        native.terminate();
        this.cleanup(native);
      }
    });

    native.duplex.on("close", () => {
      if (native.readyState !== 3) {
        native.readyState = 3;
        this.cleanup(native);
        if (this.handlers.close) {
          Promise.resolve(this.handlers.close(wrapped, 1006, "")).catch((err) =>
            console.error("[ws] close handler error:", err),
          );
        }
      }
    });

    native.duplex.on("error", (err: Error) => {
      native.readyState = 3;
      this.cleanup(native);
      if (this.handlers.error) {
        Promise.resolve(this.handlers.error(wrapped, err)).catch((e) =>
          console.error("[ws] error handler error:", e),
        );
      }
    });

    if (this.handlers.open) {
      Promise.resolve(this.handlers.open(wrapped)).catch((err) =>
        console.error("[ws] open handler error:", err),
      );
    }
  }

  /**
   * Remove a socket from every topic it had joined and from the global
   * tracking set.
   *
   * @param native - Socket being cleaned up
   *
   * @internal
   */
  private cleanup(native: any): void {
    const owned = this.socketTopics.get(native);
    if (owned) {
      for (const topic of owned) {
        this.topics.get(topic)?.delete(native);
      }
      this.socketTopics.delete(native);
    }
    this.allSockets.delete(native);
  }

  /**
   * Build the {@link ServerWebSocket} wrapper exposed to user handlers,
   * embedding topic-based pub/sub backed by the server's internal maps.
   *
   * @param native - Wrapped transport socket
   * @param data   - User-supplied `data` payload attached on upgrade
   * @param rawReq - Raw incoming message used to extract the remote address
   * @returns The fully-featured public wrapper
   *
   * @internal
   */
  private wrap(native: NativeSocket, data: Data, rawReq: any): ServerWebSocket<Data> {
    const remoteAddress: string =
      (rawReq?.socket?.remoteAddress as string) ||
      (rawReq?.headers?.["x-forwarded-for"] as string) ||
      "";

    const subscribe = (topic: string): void => {
      let set = this.topics.get(topic);
      if (!set) {
        set = new Set();
        this.topics.set(topic, set);
      }
      set.add(native);
      let owned = this.socketTopics.get(native);
      if (!owned) {
        owned = new Set();
        this.socketTopics.set(native, owned);
      }
      owned.add(topic);
    };

    const unsubscribe = (topic: string): void => {
      this.topics.get(topic)?.delete(native);
      this.socketTopics.get(native)?.delete(topic);
    };

    const publishToPeers = (topic: string, message: WSMessage): void => {
      const set = this.topics.get(topic);
      if (!set) {
        return;
      }
      const payload = toSendable(message);
      for (const peer of set) {
        if (peer !== native && peer.readyState === 1) {
          peer.send(payload);
        }
      }
    };

    const wrapper: ServerWebSocket<Data> = {
      data,
      get readyState() {
        return native.readyState;
      },
      remoteAddress,
      send: (message, _compress) => {
        const payload = toSendable(message);
        native.send(payload);
        return typeof payload === "string"
          ? Buffer.byteLength(payload as string)
          : (payload as Buffer | Uint8Array).byteLength;
      },
      close: (code, reason) => {
        native.close(code, reason);
      },
      subscribe,
      unsubscribe,
      publish: publishToPeers,
      isSubscribed: (topic) => !!this.socketTopics.get(native)?.has(topic),
      cork: (cb) => cb(wrapper),
    };

    return wrapper;
  }
}

/**
 * Return value of {@link serve}.
 */
export interface ServeInfo {
  /** Port the HTTP server is listening on. */
  port: number;
  /** Hostname the HTTP server bound to. */
  hostname: string;
  /** Full URL of the listening server (uses `http://` scheme). */
  url: URL;
  /**
   * Publish a message to all sockets subscribed to `topic`.
   *
   * @param topic     - Topic name
   * @param message   - Payload to broadcast
   * @param compress  - Whether to compress (honoured on Bun, ignored on Node)
   * @returns Number of sockets that received the message
   */
  publish: (topic: string, message: WSMessage, compress?: boolean) => number;
  /**
   * Stop the server and optionally close active connections.
   *
   * @param closeActiveConnections - When `true`, terminates all live sockets
   */
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
}

/**
 * Start a standalone WebSocket server on the given port.
 *
 * @remarks
 * Auto-detects the runtime and uses the native implementation:
 * - **Bun:** delegates to `Bun.serve()` with native WebSocket support
 * - **Node/Deno:** creates a `node:http` server with the built-in
 *   {@link WebSocketServer} upgrade handler
 *
 * @typeParam Data - Shape of the user-attached `data` field
 *
 * @param handlers - Lifecycle handlers ({@link WebSocketHandlers})
 * @param options  - Server options including `port` and `hostname`
 * @returns A promise resolving to {@link ServeInfo}
 *
 * @example
 * ```ts
 * import { serve } from "@hedystia/ws";
 *
 * const server = await serve({
 *   open:    (ws) => ws.subscribe("global"),
 *   message: (ws, msg) => ws.publish("global", msg),
 * });
 *
 * console.log(`Listening on ${server.url}`);
 * ```
 */
export async function serve<Data extends WSData = WSData>(
  handlers: WebSocketHandlers<Data>,
  options?: WebSocketServerOptions & { port?: number; hostname?: string },
): Promise<ServeInfo> {
  const { detectRuntime } = await import("./runtime");
  const runtime = detectRuntime();

  if (runtime === "bun") {
    return serveBun(handlers, options);
  }
  return serveNode(handlers, options);
}

/**
 * Start a WebSocket server using Bun's native `Bun.serve()`.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 * @param handlers - Lifecycle handlers
 * @param options  - Server options including `port` and `hostname`
 * @returns A promise resolving to {@link ServeInfo}
 *
 * @internal
 */
async function serveBun<Data extends WSData = WSData>(
  handlers: WebSocketHandlers<Data>,
  options?: WebSocketServerOptions & { port?: number; hostname?: string },
): Promise<ServeInfo> {
  const topics = new Map<string, Set<ServerWebSocket<Data>>>();
  const socketTopics = new WeakMap<ServerWebSocket<Data>, Set<string>>();
  const allSockets = new Set<ServerWebSocket<Data>>();
  const nativeToWrapped = new WeakMap<any, ServerWebSocket<Data>>();

  function cleanup(ws: ServerWebSocket<Data>): void {
    const owned = socketTopics.get(ws);
    if (owned) {
      for (const topic of owned) {
        topics.get(topic)?.delete(ws);
      }
      socketTopics.delete(ws);
    }
    allSockets.delete(ws);
  }

  const server = (globalThis as any).Bun.serve({
    port: options?.port ?? 0,
    hostname: options?.hostname ?? "0.0.0.0",
    fetch: (req: Request) => {
      if (req.headers.get("upgrade") === "websocket") {
        const data = (options?.resolveData ? options.resolveData(req) : {}) as Data;
        const ok = server.upgrade(req, { data });
        return ok ? undefined : new Response("upgrade failed", { status: 400 });
      }
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      open: (ws: any) => {
        const data = ws.data ?? ({} as Data);
        const wrapped: ServerWebSocket<Data> = createBunWrapper(ws, data, topics, socketTopics);
        nativeToWrapped.set(ws, wrapped);
        allSockets.add(wrapped);
        if (handlers.open) {
          Promise.resolve(handlers.open(wrapped)).catch((err) =>
            console.error("[ws] open handler error:", err),
          );
        }
      },
      message: (ws: any, msg: any) => {
        const wrapped = nativeToWrapped.get(ws);
        if (wrapped) {
          Promise.resolve(handlers.message(wrapped, msg)).catch((err) =>
            console.error("[ws] message handler error:", err),
          );
        }
      },
      close: (ws: any, code: number, reason: string) => {
        const wrapped = nativeToWrapped.get(ws);
        if (wrapped) {
          cleanup(wrapped);
          if (handlers.close) {
            Promise.resolve(handlers.close(wrapped, code, reason)).catch((err) =>
              console.error("[ws] close handler error:", err),
            );
          }
        }
      },
      drain: handlers.drain
        ? (ws: any) => {
            const wrapped = nativeToWrapped.get(ws);
            if (wrapped && handlers.drain) {
              Promise.resolve(handlers.drain(wrapped)).catch((err) =>
                console.error("[ws] drain handler error:", err),
              );
            }
          }
        : undefined,
    },
  });

  return {
    port: server.port,
    hostname: server.hostname,
    url: new URL(`http://${server.hostname}:${server.port}/`),
    publish: (topic, message, _compress) => {
      const set = topics.get(topic);
      if (!set || set.size === 0) {
        return 0;
      }
      const payload = toSendable(message);
      let count = 0;
      for (const ws of set) {
        if (ws.readyState === 1) {
          ws.send(payload);
          count++;
        }
      }
      return count;
    },
    stop: (closeActiveConnections) => {
      if (closeActiveConnections) {
        for (const ws of allSockets) {
          try {
            ws.close(1001, "Server shutdown");
          } catch {
            /* ignore */
          }
        }
        allSockets.clear();
      }
      server.stop(closeActiveConnections);
    },
  };
}

/**
 * Wrap a native Bun WebSocket into a {@link ServerWebSocket} compatible with
 * the public handler interface.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 * @param ws           - Raw Bun WebSocket
 * @param data         - User-supplied data payload
 * @param topics       - Global topic → socket set map
 * @param socketTopics - Reverse lookup for per-socket topic membership
 * @returns A {@link ServerWebSocket} wrapper
 *
 * @internal
 */
function createBunWrapper<Data extends WSData = WSData>(
  ws: any,
  data: Data,
  topics: Map<string, Set<ServerWebSocket<Data>>>,
  socketTopics: WeakMap<ServerWebSocket<Data>, Set<string>>,
): ServerWebSocket<Data> {
  const wrapper: ServerWebSocket<Data> = {
    data,
    get readyState() {
      return ws.readyState;
    },
    get remoteAddress() {
      return ws.remoteAddress || "";
    },
    send: (message, _compress) => {
      ws.send(message);
      return typeof message === "string"
        ? Buffer.byteLength(message)
        : (message as ArrayBuffer | Uint8Array).byteLength;
    },
    close: (code, reason) => ws.close(code, reason),
    subscribe: (topic: string) => {
      let set = topics.get(topic);
      if (!set) {
        set = new Set();
        topics.set(topic, set);
      }
      set.add(wrapper);
      let owned = socketTopics.get(wrapper);
      if (!owned) {
        owned = new Set();
        socketTopics.set(wrapper, owned);
      }
      owned.add(topic);
    },
    unsubscribe: (topic: string) => {
      topics.get(topic)?.delete(wrapper);
      socketTopics.get(wrapper)?.delete(topic);
    },
    publish: (topic: string, message: WSMessage, _compress?: boolean) => {
      const set = topics.get(topic);
      if (!set) {
        return;
      }
      const payload = toSendable(message);
      for (const peer of set) {
        if (peer !== wrapper && peer.readyState === 1) {
          peer.send(payload);
        }
      }
    },
    isSubscribed: (topic: string) =>
      !!(socketTopics.get(wrapper) as Set<string> | undefined)?.has(topic),
    cork: (cb: (ws: ServerWebSocket<Data>) => void) => cb(wrapper),
  };
  return wrapper;
}

/**
 * Start a WebSocket server using Node.js `node:http` + the built-in
 * {@link WebSocketServer} upgrade handler.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 * @param handlers - Lifecycle handlers
 * @param options  - Server options including `port` and `hostname`
 * @returns A promise resolving to {@link ServeInfo}
 *
 * @internal
 */
async function serveNode<Data extends WSData = WSData>(
  handlers: WebSocketHandlers<Data>,
  options?: WebSocketServerOptions & { port?: number; hostname?: string },
): Promise<ServeInfo> {
  const { createServer: createHttpServer } = await import("node:http");
  const wss = new WebSocketServer<Data>(handlers, options);

  const httpServer = createHttpServer((_req: any, res: any) => {
    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.on("upgrade", (req: any, socket: any, head: any) => {
    const data = options?.resolveData ? options.resolveData(req) : undefined;
    wss
      .upgrade({ rawRequest: req, socket, head }, data ? { data: data as Data } : undefined)
      .catch(() => socket.destroy());
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(options?.port ?? 0, options?.hostname ?? "0.0.0.0", resolve),
  );

  const addr = httpServer.address() as any;
  const port = addr?.port ?? 0;

  return {
    port,
    hostname: options?.hostname ?? "0.0.0.0",
    url: new URL(`http://${options?.hostname ?? "0.0.0.0"}:${port}/`),
    publish: (topic, message, _compress) => wss.publish(topic, message, _compress),
    stop: (closeActiveConnections) => {
      wss.close(closeActiveConnections);
      httpServer.close();
    },
  };
}

/**
 * Coerce a {@link WSMessage} into a form that {@link NativeSocket.send} accepts.
 *
 * @param message - User-supplied payload
 * @returns A `string`, `Buffer` or `Uint8Array` ready to be framed
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
