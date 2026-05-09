/**
 * Node.js HTTP + WebSocket adapter built on top of `node:http` and
 * `@hedystia/ws`.
 *
 * @packageDocumentation
 */

import type { Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { createServer as createHttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "@hedystia/ws";

import type { ServeOptions, UnifiedServer, WSData } from "./types";

/**
 * Internal bookkeeping for a single in-flight upgrade request.
 *
 * @internal
 */
type UpgradeCtx = {
  rawReq: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  consumed: boolean;
};

/**
 * Build a {@link UnifiedServer} backed by `node:http`.
 *
 * @remarks
 * Uses `node:http` for regular requests and delegates WebSocket upgrades to
 * `@hedystia/ws`'s portable {@link WebSocketServer}, which provides
 * topic-based pub/sub matching the shape of `Bun.ServerWebSocket`.
 *
 * @typeParam Data - Shape of the user-attached `data` field
 * @param options - Serve configuration ({@link ServeOptions})
 * @returns A {@link UnifiedServer} bound to a real Node `http.Server`.
 *
 * @example
 * ```ts
 * import { serveNode } from "./node-serve";
 *
 * const server = serveNode({
 *   port: 3000,
 *   fetch: (req) => new Response("ok"),
 * });
 * console.log(server.url.toString());
 * ```
 */
export function serveNode<Data extends WSData = WSData>(
  options: ServeOptions<Data>,
): UnifiedServer<Data> {
  const port = options.port ?? 0;
  const hostname = options.hostname ?? "0.0.0.0";

  const wsServer = options.websocket ? new WebSocketServer<Data>(options.websocket) : null;

  const pendingUpgrades = new WeakMap<Request, UpgradeCtx>();
  let unified!: UnifiedServer<Data>;

  const httpServer: HttpServer = createHttpServer(async (req, res) => {
    try {
      const request = nodeRequestToWebRequest(req);
      const response = await options.fetch(request, unified);
      await writeWebResponseToNode(response, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal Server Error";
      if (options.error) {
        try {
          const errResp = await options.error(error as Error);
          await writeWebResponseToNode(errResp, res);
          return;
        } catch {
          /* fall through to default 500 */
        }
      }
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain");
      }
      res.end(`Internal Server Error: ${message}`);
    }
  });

  httpServer.on("upgrade", async (rawReq, socket, head) => {
    if (!wsServer) {
      socket.destroy();
      return;
    }
    const request = nodeRequestToWebRequest(rawReq);
    const ctx: UpgradeCtx = { rawReq, socket, head, consumed: false };
    pendingUpgrades.set(request, ctx);
    try {
      const response = await options.fetch(request, unified);
      if (!ctx.consumed) {
        if (response?.status && !socket.destroyed) {
          socket.write(`HTTP/1.1 ${response.status} ${response.statusText || ""}\r\n\r\n`);
        }
        socket.destroy();
      }
    } catch {
      if (!ctx.consumed && !socket.destroyed) {
        socket.destroy();
      }
    } finally {
      pendingUpgrades.delete(request);
    }
  });

  httpServer.listen(port, hostname);

  unified = {
    runtime: "node",
    get port() {
      const addr = httpServer.address();
      if (addr && typeof addr === "object") {
        return addr.port;
      }
      return port;
    },
    get hostname() {
      return hostname;
    },
    get url() {
      const usedPort = (httpServer.address() as any)?.port ?? port;
      return new URL(`http://${hostname}:${usedPort}/`);
    },
    publish(topic, message, compress) {
      return wsServer?.publish(topic, message, compress) ?? 0;
    },
    upgrade(request, upgradeOptions) {
      const ctx = pendingUpgrades.get(request);
      if (!ctx || ctx.consumed || !wsServer) {
        return false;
      }
      ctx.consumed = true;
      wsServer
        .upgrade(
          { rawRequest: ctx.rawReq, socket: ctx.socket, head: ctx.head },
          { data: upgradeOptions?.data },
        )
        .catch((err) => console.error("[ws] upgrade error:", err));
      return true;
    },
    stop(closeActiveConnections) {
      wsServer?.close(closeActiveConnections);
      httpServer.close();
    },
  };

  return unified;
}

/**
 * Convert a Node `IncomingMessage` into a standards-compliant `Request`.
 *
 * @remarks
 * For methods that may carry a body, the request stream is wrapped into a
 * `ReadableStream` so the body is consumed lazily, mirroring Bun's
 * behaviour. URL is reconstructed using `X-Forwarded-Host`/`Host` headers.
 *
 * @param req - Native Node request
 * @returns A WHATWG `Request` ready to be passed to user code
 *
 * @example
 * ```ts
 * import { createServer } from "node:http";
 * import { nodeRequestToWebRequest } from "./node-serve";
 *
 * createServer(async (req, res) => {
 *   const request = nodeRequestToWebRequest(req);
 *   const json = await request.json();
 *   res.end(JSON.stringify(json));
 * });
 * ```
 */
export function nodeRequestToWebRequest(req: IncomingMessage): Request {
  const protocol =
    (req.headers["x-forwarded-proto"] as string | undefined) ||
    ((req.socket as any)?.encrypted ? "https" : "http");
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host || "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }

  const method = (req.method ?? "GET").toUpperCase();
  const init: RequestInit & { duplex?: string } = { method, headers };

  if (method !== "GET" && method !== "HEAD") {
    init.body = new ReadableStream({
      start(controller) {
        req.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        req.on("end", () => controller.close());
        req.on("error", (err) => controller.error(err));
      },
    });
    init.duplex = "half";
  }

  return new Request(url.toString(), init as RequestInit);
}

/**
 * Stream a WHATWG `Response` back through a Node `ServerResponse`.
 *
 * @param response - Response produced by user code
 * @param res - Native Node response sink
 * @returns A promise that resolves once the body has been fully written
 *
 * @example
 * ```ts
 * import { writeWebResponseToNode } from "./node-serve";
 *
 * createServer(async (_req, res) => {
 *   await writeWebResponseToNode(new Response("ok"), res);
 * });
 * ```
 */
export async function writeWebResponseToNode(
  response: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = response.status;
  if (response.statusText) {
    res.statusMessage = response.statusText;
  }
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      res.write(value);
    }
  } finally {
    res.end();
  }
}
