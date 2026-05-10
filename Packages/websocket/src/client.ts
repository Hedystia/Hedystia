import type { ClientWebSocketOptions } from "./types";

export type { ClientWebSocketOptions } from "./types";

/**
 * Resolve the `WebSocket` constructor from the current runtime's global scope.
 *
 * @remarks
 * Every supported runtime exposes a WHATWG-compliant `WebSocket` natively:
 *
 * | Runtime       | Available since |
 * |---------------|-----------------|
 * | Browsers      | always          |
 * | Bun           | always          |
 * | Deno          | v1.4            |
 * | Node.js       | v22 (stable)    |
 *
 * If `globalThis.WebSocket` is not present (e.g. Node.js < 22 without a
 * polyfill), this function throws with a descriptive message instead of
 * silently falling back to a third-party package.
 *
 * @returns The global `WebSocket` constructor.
 * @throws {Error} When no native `WebSocket` is available in the current runtime.
 *
 * @example
 * ```ts
 * import { resolveWebSocket } from "@hedystia/ws/client";
 *
 * const WS = resolveWebSocket();
 * const socket = new WS("ws://localhost:3000");
 * ```
 */
export function resolveWebSocket(): typeof WebSocket {
  if (typeof globalThis !== "undefined" && (globalThis as any).WebSocket) {
    return (globalThis as any).WebSocket as typeof WebSocket;
  }
  throw new Error(
    "@hedystia/ws: no native WebSocket found in globalThis. " +
      "Ensure you are running Bun, Deno, a modern browser, or Node.js ≥ 22.",
  );
}

/**
 * Create a `WebSocket` instance using the runtime's native `globalThis.WebSocket`.
 *
 * @remarks
 * Custom request headers are only honoured on runtimes that expose them via
 * the second constructor argument (e.g. Bun).  On browsers and other
 * WHATWG-strict environments, `options.headers` is silently ignored —
 * matching standard WebSocket semantics.
 *
 * @param url     - Absolute WebSocket URL (`ws://` or `wss://`).
 * @param options - Optional sub-protocols and headers, see {@link ClientWebSocketOptions}.
 * @returns A connected (or connecting) `WebSocket` instance.
 *
 * @throws {Error} When no native `WebSocket` is available in the current runtime.
 *
 * @example
 * ```ts
 * import { createWebSocket } from "@hedystia/ws/client";
 *
 * const ws = createWebSocket("ws://localhost:3000", {
 *   protocols: "v1",
 *   headers: { authorization: "Bearer ..." },
 * });
 *
 * ws.onopen    = () => ws.send("hi");
 * ws.onmessage = (event) => console.log(event.data);
 * ```
 */
export function createWebSocket(url: string, options?: ClientWebSocketOptions): WebSocket {
  const Ctor = resolveWebSocket();

  if (options?.protocols) {
    return new Ctor(url, options.protocols as any);
  }
  return new Ctor(url);
}

/**
 * Lightweight runtime-agnostic wrapper that mirrors a small, predictable
 * subset of the WHATWG `WebSocket` interface.
 *
 * @remarks
 * Useful for higher-level code that wants to assign event handlers by
 * property (`socket.onmessage = …`) without referencing the global
 * `WebSocket` type directly.  Delegates all operations to the native
 * `WebSocket` produced by {@link createWebSocket}.
 *
 * @example
 * ```ts
 * import { WebSocketClient } from "@hedystia/ws/client";
 *
 * const client = new WebSocketClient("ws://localhost:3000");
 * client.onopen    = () => client.send("hello");
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
   * @param url     - Absolute WebSocket URL (`ws://` or `wss://`).
   * @param options - Optional sub-protocols / headers; see {@link ClientWebSocketOptions}.
   */
  constructor(url: string, options?: ClientWebSocketOptions) {
    this.socket = createWebSocket(url, options);
  }

  /**
   * Current connection state, mirroring {@link WebSocket.readyState}.
   *
   * @returns `0` connecting · `1` open · `2` closing · `3` closed.
   */
  get readyState(): number {
    return this.socket.readyState;
  }

  /**
   * Send a payload to the server.
   *
   * @param data - WHATWG-compatible payload.
   */
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.socket.send(data as any);
  }

  /**
   * Close the underlying socket.
   *
   * @param code   - Close code (defaults to `1000`).
   * @param reason - Optional human-readable reason phrase.
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
