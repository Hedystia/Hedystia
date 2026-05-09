/**
 * Runtime-aware WebSocket client primitives.
 *
 * @packageDocumentation
 */

import type { ClientWebSocketOptions } from "./types";

export type { ClientWebSocketOptions } from "./types";

/**
 * Resolve the best `WebSocket` constructor for the current runtime.
 *
 * @remarks
 * - Bun, Deno, browsers and Node ≥ 22 expose `globalThis.WebSocket`.
 * - Older Node falls back to the [`ws`](https://github.com/websockets/ws)
 *   package, which mirrors the WHATWG `WebSocket` API.
 *
 * @returns A `WebSocket` constructor compatible with the WHATWG interface.
 *
 * @example
 * ```ts
 * import { resolveWebSocket } from "@hedystia/websocket/client";
 *
 * const WS = resolveWebSocket();
 * const socket = new WS("ws://localhost:3000");
 * ```
 */
export function resolveWebSocket(): typeof WebSocket {
  if (typeof globalThis !== "undefined" && (globalThis as any).WebSocket) {
    return (globalThis as any).WebSocket as typeof WebSocket;
  }
  const mod = require("ws");
  return (mod.WebSocket ?? mod) as typeof WebSocket;
}

/**
 * Create a `WebSocket` instance using the best available implementation
 * for the current runtime.
 *
 * @remarks
 * Custom request headers are honoured on Node via the `ws` package; on
 * runtimes that ship a WHATWG-compliant global `WebSocket` (Bun, Deno,
 * browsers, Node ≥ 22) headers are ignored — matching standard semantics.
 *
 * @param url - Absolute WebSocket URL (`ws://` or `wss://`)
 * @param options - Optional protocols / headers
 * @returns A connected (or connecting) `WebSocket` instance.
 *
 * @example
 * ```ts
 * import { createWebSocket } from "@hedystia/websocket/client";
 *
 * const ws = createWebSocket("ws://localhost:3000", {
 *   protocols: "v1",
 *   headers: { authorization: "Bearer ..." },
 * });
 *
 * ws.onopen = () => ws.send("hi");
 * ws.onmessage = (event) => console.log(event.data);
 * ```
 */
export function createWebSocket(url: string, options?: ClientWebSocketOptions): WebSocket {
  const Ctor = resolveWebSocket();
  const isWhatwg =
    typeof globalThis !== "undefined" && (globalThis as any).WebSocket === (Ctor as any);

  if (isWhatwg) {
    return options?.protocols ? new Ctor(url, options.protocols as any) : new Ctor(url);
  }

  const init: any = {};
  if (options?.headers) {
    init.headers = options.headers;
  }
  return new (Ctor as any)(url, options?.protocols, init);
}

/**
 * Lightweight runtime-agnostic wrapper that mirrors a small, predictable
 * subset of the WHATWG WebSocket interface.
 *
 * @remarks
 * Useful for higher-level code that wants to assign event handlers by
 * property (`socket.onmessage = ...`) without caring whether the underlying
 * implementation comes from `globalThis.WebSocket` or the `ws` package.
 *
 * @example
 * ```ts
 * import { WebSocketClient } from "@hedystia/websocket/client";
 *
 * const client = new WebSocketClient("ws://localhost:3000");
 * client.onopen = () => client.send("hello");
 * client.onmessage = (event) => console.log(event.data);
 * ```
 */
export class WebSocketClient {
  /**
   * Underlying WebSocket instance produced by {@link createWebSocket}.
   *
   * @readonly
   */
  readonly socket: WebSocket;

  /**
   * Create a new client and immediately initiate the connection.
   *
   * @param url - Absolute WebSocket URL (`ws://` or `wss://`)
   * @param options - Optional protocols / headers, see {@link ClientWebSocketOptions}
   */
  constructor(url: string, options?: ClientWebSocketOptions) {
    this.socket = createWebSocket(url, options);
  }

  /**
   * Current connection state, mirroring {@link WebSocket.readyState}.
   *
   * @returns `0` connecting, `1` open, `2` closing, `3` closed.
   */
  get readyState(): number {
    return this.socket.readyState;
  }

  /**
   * Send a payload to the server.
   *
   * @param data - WHATWG-compatible payload
   */
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.socket.send(data as any);
  }

  /**
   * Close the underlying socket.
   *
   * @param code - Close code (defaults to 1000)
   * @param reason - Optional human-readable reason
   */
  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  /**
   * Assign the open-event listener.
   */
  set onopen(cb: ((ev: Event) => void) | null) {
    (this.socket as any).onopen = cb;
  }
  /**
   * Assign the message-event listener.
   */
  set onmessage(cb: ((ev: MessageEvent) => void) | null) {
    (this.socket as any).onmessage = cb;
  }
  /**
   * Assign the close-event listener.
   */
  set onclose(cb: ((ev: CloseEvent) => void) | null) {
    (this.socket as any).onclose = cb;
  }
  /**
   * Assign the error-event listener.
   */
  set onerror(cb: ((ev: Event) => void) | null) {
    (this.socket as any).onerror = cb;
  }
}
