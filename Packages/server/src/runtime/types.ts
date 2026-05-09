/**
 * Internal runtime contract used by the `hedystia` server.
 *
 * @remarks
 * Bun and Node have very different APIs for spinning up an HTTP server with
 * WebSocket support; this module abstracts both into a single contract that
 * `Hedystia.listen()` can target without caring about the host.
 *
 * @packageDocumentation
 */

import type { ServerWebSocket, WebSocketHandlers, WSData } from "@hedystia/ws";

export type { ServerWebSocket, WebSocketHandlers, WSData };

/**
 * Options forwarded to {@link UnifiedServer.upgrade}.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 */
export interface UpgradeOptions<Data extends WSData = WSData> {
  /** Initial value of `ws.data` for the new connection. */
  data?: Data;
}

/**
 * Public surface of a runtime-specific HTTP + WebSocket server.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 */
export interface UnifiedServer<Data extends WSData = WSData> {
  /** Bound port (resolved after `listen()` completes). */
  readonly port: number;
  /** Bound hostname. */
  readonly hostname: string;
  /** Public URL for convenience logging. */
  readonly url: URL;
  /** Identifier of the runtime backing this server. */
  readonly runtime: "bun" | "node";
  /**
   * Publish a payload to every socket subscribed to `topic`.
   *
   * @param topic - Topic name
   * @param message - WHATWG-compatible payload
   * @param compress - Honoured on Bun, ignored on Node
   * @returns Number of sockets that received the message
   */
  publish(topic: string, message: string | ArrayBuffer | Uint8Array, compress?: boolean): number;
  /**
   * Upgrade an HTTP request to a WebSocket connection.
   *
   * @remarks
   * Only meaningful when invoked from inside `fetch`. Returns `true` when
   * the upgrade was accepted.
   *
   * @param request - Original `Request` object passed to `fetch`
   * @param options - Optional initial `data` for the new connection
   */
  upgrade(request: Request, options?: UpgradeOptions<Data>): boolean;
  /**
   * Stop accepting new connections.
   *
   * @param closeActiveConnections - When `true`, terminates live sockets too
   */
  stop(closeActiveConnections?: boolean): void | Promise<void>;
}

/**
 * Options accepted by the runtime-agnostic `serve()` function.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 */
export interface ServeOptions<Data extends WSData = WSData> {
  /** Port to bind. Defaults to a random free port. */
  port?: number;
  /** Hostname to bind. Defaults to `0.0.0.0`. */
  hostname?: string;
  /** Reuse the port across workers. Honoured on Bun. */
  reusePort?: boolean;
  /** Connection idle timeout in seconds. Honoured on Bun. */
  idleTimeout?: number;
  /**
   * Request handler.
   *
   * @param request - Incoming HTTP `Request`
   * @param server - Reference to the {@link UnifiedServer} (for `upgrade`)
   */
  fetch: (request: Request, server: UnifiedServer<Data>) => Response | Promise<Response>;
  /** Optional WebSocket lifecycle handlers. */
  websocket?: WebSocketHandlers<Data>;
  /** Optional global error handler invoked for uncaught failures. */
  error?: (error: Error) => Response | Promise<Response>;
}
