import type { ServeOptions, ServerWebSocket, UnifiedServer, WSData } from "./types";

declare const Bun: any;

/**
 * Build a {@link UnifiedServer} backed by `Bun.serve`.
 *
 * @remarks
 * Delegates everything — including the high-performance built-in WebSocket
 * layer (topic-based pub/sub, compression, etc) — to Bun. No external
 * WebSocket library is loaded on Bun.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 * @param options - Serve configuration ({@link ServeOptions})
 * @returns A {@link UnifiedServer} bound to a real Bun server.
 *
 * @example
 * ```ts
 * import { serveBun } from "./bun-serve";
 *
 * const server = serveBun({
 *   port: 3000,
 *   fetch: (req) => new Response("ok"),
 * });
 * console.log(server.url.toString());
 * ```
 */
export function serveBun<Data extends WSData = WSData>(
  options: ServeOptions<Data>,
): UnifiedServer<Data> {
  const ws = options.websocket;

  const websocketConfig = ws
    ? {
        message: (socket: any, message: any) =>
          ws.message(socket as ServerWebSocket<Data>, message),
        open: ws.open ? (socket: any) => ws.open!(socket as ServerWebSocket<Data>) : undefined,
        close: ws.close
          ? (socket: any, code: number, reason: string) =>
              ws.close!(socket as ServerWebSocket<Data>, code, reason)
          : undefined,
        error: ws.error
          ? (socket: any, error: Error) => ws.error!(socket as ServerWebSocket<Data>, error)
          : undefined,
        drain: ws.drain ? (socket: any) => ws.drain!(socket as ServerWebSocket<Data>) : undefined,
      }
    : undefined;

  let unified!: UnifiedServer<Data>;

  const raw = Bun.serve({
    port: options.port,
    hostname: options.hostname,
    reusePort: options.reusePort,
    idleTimeout: options.idleTimeout,
    websocket: websocketConfig,
    error: options.error,
    fetch: (req: Request, _server: any) => options.fetch(req, unified),
  });

  unified = {
    runtime: "bun",
    get port() {
      return raw.port;
    },
    get hostname() {
      return raw.hostname;
    },
    get url() {
      return raw.url;
    },
    publish(topic, message, compress) {
      return raw.publish(topic, message as any, compress);
    },
    upgrade(request, opts) {
      return raw.upgrade(request, opts as any);
    },
    stop(closeActiveConnections) {
      return raw.stop(closeActiveConnections);
    },
  };

  return unified;
}
