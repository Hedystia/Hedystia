/**
 * Payload accepted by every `send`/`publish` method.
 *
 * @remarks
 * Matches the WHATWG `WebSocket.send` signature plus the `Uint8Array`
 * convenience accepted by Bun and the native Node.js implementation.
 */
export type WSMessage = string | ArrayBuffer | Uint8Array;

/**
 * Bag of arbitrary, user-supplied state attached to a connection on
 * upgrade and exposed to handlers as `ws.data`.
 *
 * @typeParam K - String key
 * @typeParam V - Stored value
 */
export type WSData = Record<string, any>;

/**
 * The per-connection wrapper passed to every handler.
 *
 * @remarks
 * The interface intentionally mirrors `Bun.ServerWebSocket` so that the
 * same handler code works on Bun (native) and on Node.js / Deno (via
 * {@link WebSocketServer}). Topic-based pub/sub is implemented in
 * user-space when running outside Bun.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 *
 * @example
 * ```ts
 * const handlers: WebSocketHandlers<{ user: string }> = {
 *   open:    (ws) => ws.subscribe(`user:${ws.data.user}`),
 *   message: (ws, msg) => ws.publish(`user:${ws.data.user}`, msg),
 * };
 * ```
 */
export interface ServerWebSocket<Data extends WSData = WSData> {
  /** User-supplied state attached to the socket on upgrade. */
  readonly data: Data;
  /** Standard WHATWG ready-state (`0` connecting, `1` open, `2` closing, `3` closed). */
  readonly readyState: number;
  /** Remote IP, taken from `X-Forwarded-For` when present. */
  readonly remoteAddress: string;
  /**
   * Send a message to this socket only.
   *
   * @param message  - Payload to send
   * @param compress - Whether to compress (honoured on Bun, ignored on Node)
   * @returns Number of bytes written (best-effort on Node)
   */
  send(message: WSMessage, compress?: boolean): number;
  /**
   * Close the connection.
   *
   * @param code   - Close code (defaults to `1000`)
   * @param reason - Optional human-readable reason phrase
   */
  close(code?: number, reason?: string): void;
  /**
   * Subscribe this socket to a topic so it receives subsequent
   * {@link ServerWebSocket.publish | publish} or
   * {@link WebSocketServer.publish | server.publish} broadcasts.
   *
   * @param topic - Topic name
   */
  subscribe(topic: string): void;
  /**
   * Unsubscribe this socket from a previously joined topic.
   *
   * @param topic - Topic name
   */
  unsubscribe(topic: string): void;
  /**
   * Broadcast a message to every other socket subscribed to `topic`.
   *
   * @remarks
   * The sender is excluded by default — matching Bun's default behaviour.
   *
   * @param topic    - Topic name
   * @param message  - Payload to broadcast
   * @param compress - Whether to compress (honoured on Bun, ignored on Node)
   */
  publish(topic: string, message: WSMessage, compress?: boolean): void;
  /**
   * Check whether this socket is currently subscribed to `topic`.
   *
   * @param topic - Topic name
   * @returns `true` when subscribed
   */
  isSubscribed(topic: string): boolean;
  /**
   * Batch multiple writes inside `cb`.
   *
   * @remarks
   * On Bun this corresponds to `corked()`; on Node it is a no-op alias
   * that simply invokes `cb(this)` synchronously.
   *
   * @param cb - Function invoked with the same socket
   */
  cork(cb: (ws: ServerWebSocket<Data>) => void): void;
}

/**
 * Bun-style compression dictionary identifier.
 *
 * @remarks
 * Used by Bun's `perMessageDeflate` configuration. Passed through verbatim
 * to Bun when running natively; has no effect on the pure-Node
 * implementation shipped by `@hedystia/ws`.
 */
export type Compressor =
  | "disable"
  | "shared"
  | "dedicated"
  | "3KB"
  | "4KB"
  | "8KB"
  | "16KB"
  | "32KB"
  | "64KB"
  | "128KB"
  | "256KB";

/**
 * Per-message deflate configuration.
 *
 * @remarks
 * Accepts either a boolean (`true` enables defaults, `false` disables it)
 * or a free-form object. Bun's {@link Compressor} strings (`"3KB"`,
 * `"shared"`, …) are supported when running on Bun natively.
 *
 * **Note:** This option has no effect on the built-in Node.js implementation
 * — `@hedystia/ws` does not negotiate the `permessage-deflate` extension.
 */
export type PerMessageDeflate =
  | boolean
  | (Record<string, any> & {
      compress?: boolean | Compressor;
      decompress?: boolean | Compressor;
    });

/**
 * Construction options for {@link WebSocketServer}.
 */
export interface WebSocketServerOptions {
  /** Maximum allowed payload in bytes. Defaults to 100 MiB. */
  maxPayload?: number;
  /**
   * Per-message deflate configuration.
   *
   * @remarks
   * Has no effect on the built-in Node.js implementation; reserved for
   * future Bun-native integration.
   */
  perMessageDeflate?: PerMessageDeflate;
}

/**
 * Lifecycle handlers passed to {@link WebSocketServer}.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 */
export interface WebSocketHandlers<Data extends WSData = WSData> {
  /** Called for every inbound message. */
  message: (ws: ServerWebSocket<Data>, message: WSMessage) => void | Promise<void>;
  /** Called once the handshake completes successfully. */
  open?: (ws: ServerWebSocket<Data>) => void | Promise<void>;
  /** Called after the connection closes (clean or otherwise). */
  close?: (ws: ServerWebSocket<Data>, code: number, reason: string) => void | Promise<void>;
  /** Called when the underlying transport raises an error. */
  error?: (ws: ServerWebSocket<Data>, error: Error) => void | Promise<void>;
  /**
   * Called when back-pressure is relieved.
   *
   * @remarks
   * Only fired by Bun; Node-backed servers never invoke it.
   */
  drain?: (ws: ServerWebSocket<Data>) => void | Promise<void>;
}

/**
 * Options accepted by {@link createWebSocket}.
 */
export interface ClientWebSocketOptions {
  /** Sub-protocols negotiated during the handshake. */
  protocols?: string | string[];
  /**
   * Custom request headers.
   *
   * @remarks
   * Only honoured on runtimes that support them via the `WebSocket`
   * constructor (e.g. Bun). WHATWG-strict environments (browsers, Deno,
   * Node.js ≥ 22) ignore this field — matching standard WebSocket semantics.
   */
  headers?: Record<string, string>;
}

/**
 * Raw upgrade tuple consumed by {@link WebSocketServer.upgrade}.
 *
 * @remarks
 * Mirrors what `node:http`'s `'upgrade'` event emits.
 */
export interface UpgradeRequest {
  /** Raw `IncomingMessage`-like object exposing `headers`, `method`, `url`. */
  rawRequest: any;
  /** Raw duplex socket (e.g. `node:net.Socket`). */
  socket: any;
  /** Initial buffer captured by the HTTP parser. */
  head: Buffer | Uint8Array;
}

/**
 * Options forwarded to {@link WebSocketServer.upgrade}.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 */
export interface UpgradeOptions<Data extends WSData = WSData> {
  /** Initial value of `ws.data` for the new connection. */
  data?: Data;
  /**
   * Extra response headers.
   *
   * @remarks
   * Reserved for future use; currently ignored by the native implementation.
   * On Bun-native integration this would be forwarded to the handshake.
   */
  headers?: Record<string, string> | Headers;
}
