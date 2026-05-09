import { detectRuntime } from "@hedystia/ws";
import type { ServeOptions, UnifiedServer, WSData } from "./types";

export type {
  ServeOptions,
  ServerWebSocket,
  UnifiedServer,
  UpgradeOptions,
  WebSocketHandlers,
  WSData,
} from "./types";

/**
 * Start a unified HTTP + WebSocket server.
 *
 * @remarks
 * Detects the host runtime and dispatches to the matching adapter:
 *
 * - **Bun** uses `Bun.serve` with the native WebSocket layer.
 * - **Node.js** uses `node:http` + `@hedystia/ws`'s portable
 *   `WebSocketServer` for upgrades and pub/sub.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 * @param options - Serve configuration ({@link ServeOptions})
 * @returns A {@link UnifiedServer} bound to the active runtime.
 *
 * @example
 * ```ts
 * import { serve } from "./runtime";
 *
 * serve({
 *   port: 3000,
 *   fetch: () => new Response("hello"),
 * });
 * ```
 */
export function serve<Data extends WSData = WSData>(
  options: ServeOptions<Data>,
): UnifiedServer<Data> {
  if (detectRuntime() === "bun") {
    const { serveBun } = require("./bun-serve") as typeof import("./bun-serve");
    return serveBun<Data>(options);
  }
  const { serveNode } = require("./node-serve") as typeof import("./node-serve");
  return serveNode<Data>(options);
}

export { nodeRequestToWebRequest, writeWebResponseToNode } from "./node-serve";
