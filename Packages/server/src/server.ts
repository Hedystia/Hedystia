import { generateTypes } from "@hedystia/types";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import Core from "./core";
import generateCorsHeaders from "./handlers/cors";
import processGenericHandlers from "./handlers/generic";
import { Router } from "./router";
import { serve as serveUnified, type UnifiedServer } from "./runtime";
import type {
  CookieOptions,
  CorsOptions,
  MacroData,
  ResponseContext,
  RouteDefinition,
  RouteSchema,
  ServerWebSocket,
  SubscriptionContext,
  SubscriptionHandler,
  ValidationSchema,
} from "./types";
import type { Assertion } from "./types/routes";
import type { DebugLevel } from "./utils";
import { createLogger, determineContentType, isBunHTMLBundle, parseRequestBody } from "./utils";

interface FrameworkOptions<H extends ValidationSchema | undefined = undefined> {
  reusePort?: boolean;
  cors?: CorsOptions | boolean;
  idleTimeout?: number;
  sse?: boolean;
  debugLevel?: DebugLevel;
  headers?: H;
}

type WebSocketData = {
  __wsPath?: string;
  request?: Request;
  subscribedTopics?: Set<string>;
};

export class Hedystia<
  Routes extends RouteDefinition[] = [],
  _Macros extends MacroData = {},
  GlobalHeaders extends ValidationSchema | undefined = undefined,
> extends Core<Routes, _Macros, GlobalHeaders> {
  private reusePort: boolean;
  private idleTimeout: number;
  private router = new Router();
  private staticRoutesFast: Map<string, (req: Request) => any> = new Map();
  private isCompiled = false;
  private log: ReturnType<typeof createLogger>;
  private defaultHeaders: ValidationSchema | undefined;

  private activeConnections: Map<
    ServerWebSocket,
    {
      lastPong: number;
      subscriptions: Map<string, string>;
    }
  > = new Map();
  private messageHandlers: Map<
    string,
    {
      callback: (message: any) => void | Promise<void>;
      schema?: any;
    }
  > = new Map();
  private pendingDisconnections: Map<
    string,
    {
      timeout: ReturnType<typeof setTimeout>;
      path: string;
      subscriptionId: string;
      ws: ServerWebSocket;
    }
  > = new Map();
  private pendingActivityChecks: Map<
    string,
    {
      resolve: (value: boolean) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  > = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly PING_INTERVAL = 30000;
  private readonly PONG_TIMEOUT = 60000;
  private readonly RECONNECT_GRACE_PERIOD = 5000;
  private readonly ACTIVITY_CHECK_TIMEOUT = 5000;

  constructor(options?: FrameworkOptions<GlobalHeaders>) {
    super();
    this.reusePort = options?.reusePort ?? false;
    this.cors =
      options?.cors === false ? undefined : options?.cors === true ? {} : (options?.cors ?? {});
    this.idleTimeout = options?.idleTimeout ?? 10;
    this.sseMode = options?.sse ?? false;
    this.log = createLogger(options?.debugLevel ?? "none");
    this.defaultHeaders = options?.headers;
  }

  static createResponse(data: any, contentType?: string): Response {
    if (data instanceof Response) {
      return data;
    }

    if (contentType === "text/plain" || typeof data === "string") {
      return new Response(data, {
        headers: { "Content-Type": contentType || determineContentType(data) },
      });
    }
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      return new Response(data);
    }
    if (data instanceof Blob) {
      return new Response(data);
    }
    if (data instanceof FormData) {
      return new Response(data);
    }

    if (isBunHTMLBundle(data)) {
      const anyBun = (globalThis as any).Bun;
      if (anyBun) {
        return new Response(anyBun.file(data.index));
      }
    }

    return Response.json(data);
  }

  /**
   * Generates a type definition file (.d.ts) for all registered routes.
   * @param {string} filePath - The path to the file where the types will be saved (e.g., "./server.d.ts").
   * @returns {this} The current instance of the framework for chaining.
   */
  async buildTypes(filePath: string): Promise<this> {
    const routes = this.routes.map((route) => ({
      method: route.method,
      path: route.path,
      params: route.schema.params,
      query: route.schema.query,
      body: route.schema.body,
      response: route.schema.response,
      headers: route.schema.headers,
      data: route.schema.data,
      error: route.schema.error,
    }));

    const subscriptionRoutes = Array.from(this.subscriptionHandlers.entries()).map(
      ([path, { schema }]) => ({
        method: "SUB",
        path,
        params: schema.params,
        query: schema.query,
        body: schema.body,
        response: schema.response,
        headers: schema.headers,
        data: schema.data,
        error: schema.error,
      }),
    );

    await generateTypes([...routes, ...subscriptionRoutes], filePath);

    return this;
  }

  /**
   * Get all registered routes in the current application
   * @returns {Routes} The list of all route definitions
   */
  get allRoutes(): Routes {
    return this.routes as unknown as Routes;
  }

  private composeHandler(route: any) {
    const hasBody = ["PATCH", "POST", "PUT", "DELETE"].includes(route.method);
    const hooks = {
      onRequest: this.onRequestHandlers,
      onTransform: this.onTransformHandlers,
      onBeforeHandle: this.onBeforeHandleHandlers,
      onAfterHandle: this.onAfterHandleHandlers,
      onMapResponse: this.onMapResponseHandlers,
      onAfterResponse: this.onAfterResponseHandlers,
      onError: this.onErrorHandlers,
      onParse: this.onParseHandlers,
    };

    const paramsSchema = route.schema.params?.["~standard"];
    const querySchema = route.schema.query?.["~standard"];
    const headersSchema = route.schema.headers?.["~standard"];
    const bodySchema = route.schema.body;
    const errorSchema = route.schema.error?.["~standard"];

    return async (req: Request, params: Record<string, string>) => {
      let ctx: any;
      try {
        const urlStr = req.url;
        const qIndex = urlStr.indexOf("?");
        let query =
          qIndex !== -1
            ? Object.fromEntries(new URLSearchParams(urlStr.substring(qIndex)).entries())
            : {};

        for (let i = 0; i < hooks.onRequest.length; i++) {
          const handler = hooks.onRequest[i];
          if (handler) {
            const res = handler(req);
            if (res instanceof Promise) {
              req = await res;
            } else {
              req = res as Request;
            }
          }
        }

        if (paramsSchema) {
          const result = paramsSchema.validate(params);
          if (result.issues) {
            throw { statusCode: 400, message: "Invalid params" };
          }
          if ("value" in result) {
            params = result.value;
          }
        }

        if (querySchema) {
          const result = querySchema.validate(query);
          if (result.issues) {
            throw { statusCode: 400, message: "Invalid query parameters" };
          }
          if ("value" in result) {
            query = result.value;
          }
        }

        const rawHeaders: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          rawHeaders[k.toLowerCase()] = v;
        });

        let headers: Record<string, string> = { ...rawHeaders };
        if (this.defaultHeaders) {
          const globalResult = this.defaultHeaders["~standard"].validate(rawHeaders);
          if (globalResult && "value" in globalResult) {
            headers = { ...headers, ...globalResult.value };
          }
        }
        if (headersSchema) {
          const result = headersSchema.validate(rawHeaders);
          if (result.issues) {
            throw { statusCode: 400, message: "Invalid header value" };
          }
          if ("value" in result) {
            headers = { ...headers, ...result.value };
          }
        }

        let body: any;
        let rawBody: any;

        if (hasBody) {
          try {
            let parsed = false;
            if (hooks.onParse.length > 0) {
              const cloned = req.clone() as unknown as Request;
              for (let i = 0; i < hooks.onParse.length; i++) {
                const handler = hooks.onParse[i];
                if (handler) {
                  const res = handler(cloned);
                  const r = res instanceof Promise ? await res : res;
                  if (r !== undefined) {
                    body = r;
                    parsed = true;
                    break;
                  }
                }
              }
            }

            if (!parsed) {
              body = await parseRequestBody(req);
            }

            if (body === "") {
              body = undefined;
            }

            if (bodySchema?.["~standard"]) {
              const result = bodySchema["~standard"].validate(body);
              if (result instanceof Promise ? (await result).issues : result.issues) {
                throw { statusCode: 400, message: "Invalid body" };
              }
              if ("value" in result) {
                body = result.value;
              }
            }
          } catch {
            if (bodySchema) {
              throw { statusCode: 400, message: "Invalid body format" };
            }
          }
        }

        ctx = {
          req,
          params,
          query,
          headers,
          rawHeaders,
          body,
          rawBody,
          route: route.path,
          method: route.method,
          error: (statusCode: number, message?: string) => {
            throw { statusCode, message: message || "Error" };
          },
          set: this.createResponseContext(),
          publish: this.publish,
        };

        for (let i = 0; i < hooks.onTransform.length; i++) {
          const handler = hooks.onTransform[i];
          if (handler) {
            const res = handler(ctx);
            const transformed = res instanceof Promise ? await res : res;
            if (transformed && typeof transformed === "object") {
              Object.assign(ctx, transformed);
            }
          }
        }

        let result;

        const runMain = async () => {
          return route.handler(ctx);
        };

        if (hooks.onBeforeHandle.length > 0) {
          let idx = 0;
          const next = async (): Promise<any> => {
            if (idx >= hooks.onBeforeHandle.length) {
              return runMain();
            }
            const handler = hooks.onBeforeHandle[idx++];
            if (handler) {
              return handler(ctx, next);
            }
            return next();
          };
          result = await next();
        } else {
          result = await runMain();
        }

        if (hooks.onMapResponse.length > 0) {
          for (let i = 0; i < hooks.onMapResponse.length; i++) {
            const handler = hooks.onMapResponse[i];
            if (handler) {
              const res = handler(result, ctx);
              const r = res instanceof Promise ? await res : res;
              if (r !== undefined) {
                result = r;
                break;
              }
            }
          }
        }

        if (!(result instanceof Response)) {
          result = Hedystia.createResponse(result);
        }

        result = this.applyResponseContext(result, ctx.set);

        if (hooks.onAfterHandle.length > 0) {
          for (let i = 0; i < hooks.onAfterHandle.length; i++) {
            const handler = hooks.onAfterHandle[i];
            if (handler) {
              const res = handler(result, ctx);
              const r = res instanceof Promise ? await res : res;
              if (r !== undefined) {
                result = r;
              }
            }
          }
        }

        if (!(result instanceof Response)) {
          result = Hedystia.createResponse(result);
        }
        result = this.applyResponseContext(result, ctx.set);

        if (hooks.onAfterResponse.length > 0) {
          setTimeout(() => {
            for (let i = 0; i < hooks.onAfterResponse.length; i++) {
              const handler = hooks.onAfterResponse[i];
              if (handler) {
                handler(result, ctx);
              }
            }
          }, 0);
        }

        return result;
      } catch (err: any) {
        if (hooks.onError.length > 0) {
          for (let i = 0; i < hooks.onError.length; i++) {
            try {
              const handler = hooks.onError[i];
              if (handler) {
                const res = handler(err, ctx);
                const r = res instanceof Promise ? await res : res;
                if (r !== undefined) {
                  let errResult = r;
                  if (!(errResult instanceof Response)) {
                    errResult = Hedystia.createResponse(errResult);
                  }
                  return this.applyResponseContext(
                    errResult,
                    ctx?.set || {
                      status: () => {},
                      headers: { set: () => {}, get: () => null, delete: () => {}, add: () => {} },
                      cookies: { get: () => undefined, set: () => {}, delete: () => {} },
                    },
                  );
                }
              }
            } catch {}
          }
        }

        const status = err.statusCode || 500;
        const msg = err.message || "Internal Server Error";

        let finalRes;
        if (errorSchema) {
          finalRes = new Response(JSON.stringify({ message: msg, code: status }), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        } else {
          finalRes = new Response(JSON.stringify({ message: msg, code: status }), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }

        return finalRes;
      }
    };
  }

  private compile() {
    if (this.isCompiled) {
      return;
    }
    for (const staticRoute of this.staticRoutes) {
      const handler = async (req: Request): Promise<Response> => {
        if (this.cors && req.method === "OPTIONS") {
          const headers = await generateCorsHeaders(this.cors, req);
          return new Response(null, { status: 204, headers: headers as any });
        }
        let res = (staticRoute.response as Response).clone() as Response;
        if (this.cors) {
          res = (await this.applyCorsHeaders(res, req)) as Response;
        }
        return res;
      };
      this.staticRoutesFast.set(staticRoute.path, handler);
      this.router.add("GET", staticRoute.path, handler);
    }

    for (const route of this.routes) {
      const compiledHandler = this.composeHandler(route);
      this.router.add(route.method, route.path, compiledHandler);
    }

    for (const [routePath, handlerData] of this.subscriptionHandlers.entries()) {
      this.router.add("SUB", routePath, handlerData);
    }

    this.isCompiled = true;
  }

  public async fetch(req: Request): Promise<Response> {
    this.compile();
    const url = req.url;
    const s = url.indexOf("/", 11);
    const q = url.indexOf("?", s + 1);
    const path = q === -1 ? url.substring(s) : url.substring(s, q);
    const method = req.method;

    if (this.cors && method === "OPTIONS") {
      const corsHeaders = await generateCorsHeaders(this.cors, req);
      return new Response(null, {
        status: 204,
        headers: corsHeaders as any,
      });
    }

    if (method === "POST") {
      const subscriptionId = req.headers.get("x-hedystia-subscription-id");
      if (subscriptionId) {
        const conn = this.sseConnections.get(subscriptionId);
        if (conn?.onMessage) {
          try {
            const body = await parseRequestBody(req);
            conn.onMessage(body);
            const response = new Response("OK", { status: 200 });
            return this.cors
              ? ((await this.applyCorsHeaders(response, req)) as Response)
              : response;
          } catch {
            const response = new Response("Invalid Body", { status: 400 });
            return this.cors
              ? ((await this.applyCorsHeaders(response, req)) as Response)
              : response;
          }
        } else {
          const response = new Response("Subscription not found", { status: 404 });
          return this.cors ? ((await this.applyCorsHeaders(response, req)) as Response) : response;
        }
      }
    }

    const fastStatic = this.staticRoutesFast.get(path);
    if (fastStatic && method === "GET") {
      const response = await fastStatic(req);
      if (this.cors) {
        return await this.applyCorsHeaders(response, req);
      }
      return response;
    }

    const match = this.router.find(method, path);
    if (match) {
      const response = await match.handler(req, match.params);
      if (this.cors) {
        return await this.applyCorsHeaders(response, req);
      }
      return response;
    }

    if (this.genericHandlers.length > 0) {
      const response = await processGenericHandlers(req, this.genericHandlers, 0);
      if (this.cors) {
        return await this.applyCorsHeaders(response, req);
      }
      return response;
    }

    const notFoundResponse = new Response("Not Found", { status: 404 });
    if (this.cors) {
      return await this.applyCorsHeaders(notFoundResponse, req);
    }
    return notFoundResponse;
  }

  private registerSSERoutes(): void {
    for (const [routePath, handlerData] of this.subscriptionHandlers.entries()) {
      const sseHandler = async (req: Request, params: Record<string, string>) => {
        const url = new URL(req.url);
        const query = Object.fromEntries(url.searchParams.entries());
        const rawHeaders: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          rawHeaders[k.toLowerCase()] = v;
        });

        let validatedParams = params || {};
        if (handlerData.schema.params) {
          const result = handlerData.schema.params["~standard"].validate(params) as any;
          if ("issues" in result) {
            return new Response(JSON.stringify({ error: "Invalid params" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          validatedParams = result.value;
        }

        let validatedQuery = query || {};
        if (handlerData.schema.query) {
          const result = handlerData.schema.query["~standard"].validate(query) as any;
          if ("issues" in result) {
            return new Response(JSON.stringify({ error: "Invalid query" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          validatedQuery = result.value;
        }

        let validatedHeaders: Record<string, string> = { ...rawHeaders };
        if (this.defaultHeaders) {
          const globalResult = this.defaultHeaders["~standard"].validate(rawHeaders) as any;
          if (globalResult && "value" in globalResult) {
            validatedHeaders = { ...validatedHeaders, ...globalResult.value };
          }
        }
        if (handlerData.schema.headers) {
          const result = handlerData.schema.headers["~standard"].validate(rawHeaders) as any;
          if ("issues" in result) {
            return new Response(JSON.stringify({ error: "Invalid headers" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          validatedHeaders = { ...validatedHeaders, ...result.value };
        }

        const subscriptionId = (Math.random() * 1e9).toString(36);
        const topic = url.pathname;

        let isClosed = false;

        const stream = new ReadableStream({
          start: (controller) => {
            this.sseConnections.set(subscriptionId, {
              controller,
              subscriptionId,
              path: topic,
            });

            (async () => {
              const isActive = async () => !isClosed && this.sseConnections.has(subscriptionId);
              const publish = (data: any) => {
                if (!isClosed && this.sseConnections.has(subscriptionId)) {
                  const msg = `data: ${JSON.stringify({ path: topic, data })}\n\n`;
                  controller.enqueue(new TextEncoder().encode(msg));
                }
              };

              await Promise.all(
                this.onSubscriptionOpenHandlers.map(async (h) => {
                  try {
                    await h({
                      path: topic,
                      subscriptionId,
                      ws: null as any,
                      isActive,
                      publish,
                    });
                  } catch (e) {
                    console.error("[SSE] Error in subscriptionOpen handler:", e);
                  }
                }),
              );

              const ctx: SubscriptionContext<any> = {
                ws: null as any,
                req,
                params: validatedParams,
                query: validatedQuery,
                headers: validatedHeaders,
                rawHeaders,
                body: undefined,
                route: topic,
                method: "SUB",
                data: undefined,
                errorData: undefined,
                subscriptionId,
                isActive,
                error: (statusCode: number, message?: string): never => {
                  throw { statusCode, message: message || "Error" };
                },
                sendData: async (data: any) => {
                  if (!isClosed && this.sseConnections.has(subscriptionId)) {
                    const msg = `data: ${JSON.stringify({ path: topic, data, subscriptionId })}\n\n`;
                    controller.enqueue(new TextEncoder().encode(msg));
                  }
                },
                sendError: async (error: any) => {
                  if (!isClosed && this.sseConnections.has(subscriptionId)) {
                    const msg = `data: ${JSON.stringify({ path: topic, error, subscriptionId })}\n\n`;
                    controller.enqueue(new TextEncoder().encode(msg));
                  }
                },
                publish: this.publish,
                onMessage: (handler: (message: any) => void) => {
                  const conn = this.sseConnections.get(subscriptionId);
                  if (conn) {
                    conn.onMessage = async (data: any) => {
                      try {
                        await Promise.all(
                          this.onSubscriptionMessageHandlers.map(async (h) => {
                            try {
                              await h({
                                path: topic,
                                subscriptionId,
                                ws: null as any,
                                isActive,
                                message: data,
                                sendData: ctx.sendData,
                                sendError: ctx.sendError,
                              });
                            } catch (e) {
                              console.error("[SSE] Error in subscriptionMessage handler:", e);
                            }
                          }),
                        );
                        handler(data);
                      } catch (e) {
                        console.error("[SSE] Error in onMessage handler:", e);
                      }
                    };
                  }
                },
              };

              try {
                const result = await handlerData.handler(ctx);
                if (result !== undefined) {
                  const msg = `data: ${JSON.stringify({ path: topic, data: result, subscriptionId })}\n\n`;
                  controller.enqueue(new TextEncoder().encode(msg));
                }
              } catch (e) {
                console.error("[SSE] Error in subscription handler:", e);
              }
            })();
          },
          cancel: async () => {
            isClosed = true;
            const connInfo = this.sseConnections.get(subscriptionId);
            if (connInfo) {
              this.sseConnections.delete(subscriptionId);
              const isActive = async () => false;
              const publish = () => {};
              await Promise.all(
                this.onSubscriptionCloseHandlers.map(async (h) => {
                  try {
                    await h({
                      path: topic,
                      subscriptionId,
                      ws: null as any,
                      reason: "disconnect",
                      isActive,
                      publish,
                    });
                  } catch (e) {
                    console.error("[SSE] Error in subscriptionClose handler:", e);
                  }
                }),
              );
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      };

      this.router.add("GET", routePath, sseHandler);
    }
  }

  /**
   * Start HTTP server
   *
   * Works on both Bun and Node.js without any additional adapter. WebSocket
   * upgrades are handled by `@hedystia/ws` which transparently uses
   * `Bun.serve` on Bun and `node:http` + `ws` on Node.
   *
   * @param {number} port - Server port number
   * @param {function} [callback] - Optional callback invoked once the server is listening
   * @returns {this} Current instance
   */
  listen(port: number, callback?: (server: NonNullable<typeof this.server>) => void): this {
    this.compile();

    if (this.sseMode) {
      this.registerSSERoutes();
      this.server = serveUnified({
        port,
        reusePort: this.reusePort,
        idleTimeout: this.idleTimeout,
        fetch: (req) => this.fetch(req),
      }) as unknown as UnifiedServer;
      if (callback) {
        callback(this.server!);
      }
      return this;
    }

    const hasWebSocket = this.wsRoutes.size > 0 || this.subscriptionHandlers.size > 0;

    if (hasWebSocket) {
      this.server = serveUnified<WebSocketData>({
        port,
        reusePort: this.reusePort,
        idleTimeout: this.idleTimeout,
        fetch: (req, server) => {
          const upgradeHeader = req.headers.get("upgrade");
          if (upgradeHeader?.toLowerCase() === "websocket") {
            const url = new URL(req.url);
            const path = url.pathname;
            const wsRoute = this.wsRoutes.get(path);
            if (wsRoute) {
              const upgraded = server.upgrade(req, { data: { __wsPath: path } });
              if (upgraded) {
                return new Response(null, { status: 101 });
              }
              return new Response("WebSocket upgrade failed", { status: 400 });
            }
            if (this.subscriptionHandlers.size > 0) {
              const upgraded = server.upgrade(req, {
                data: { request: req, subscribedTopics: new Set() },
              });
              if (upgraded) {
                return new Response(null, { status: 101 });
              }
            }
          }
          return this.fetch(req);
        },
        websocket: this.createWebSocketHandlers(),
      }) as unknown as UnifiedServer;
      this.startHeartbeat();
    } else {
      this.server = serveUnified({
        port,
        reusePort: this.reusePort,
        idleTimeout: this.idleTimeout,
        fetch: (req) => this.fetch(req),
      }) as unknown as UnifiedServer;
    }

    if (callback) {
      callback(this.server!);
    }

    return this;
  }

  /**
   * Start the heartbeat interval to check client activity and detect stale connections
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      return;
    }
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [ws, connInfo] of this.activeConnections) {
        if (now - connInfo.lastPong > this.PONG_TIMEOUT) {
          (async () => {
            await Promise.all(
              Array.from(connInfo.subscriptions.entries()).map(async ([path, subscriptionId]) => {
                const isActive = async (): Promise<boolean> => {
                  return this.checkActivity(ws, subscriptionId);
                };
                const publish = (payload: any, targetId?: string) => {
                  const messagePayload = {
                    path,
                    ...(payload &&
                    typeof payload === "object" &&
                    ("data" in payload || "error" in payload)
                      ? payload
                      : { data: payload }),
                    subscriptionId: targetId || subscriptionId,
                  };
                  const msg = JSON.stringify(messagePayload);
                  if (targetId) {
                    ws.send(msg);
                  } else {
                    ws.publish(path, msg);
                  }
                };
                await Promise.all(
                  this.onSubscriptionCloseHandlers.map(async (handler) => {
                    try {
                      await handler({
                        path,
                        subscriptionId,
                        ws,
                        reason: "timeout",
                        isActive,
                        publish,
                      });
                    } catch (e) {
                      console.error("[WS] Error in subscriptionClose handler:", e);
                    }
                  }),
                );
              }),
            );
          })();
          try {
            ws.close(1000, "Connection timeout - no activity response received");
            this.log("warn", "Connection closed due to activity check timeout");
          } catch {}
          this.activeConnections.delete(ws);
        } else {
          for (const [path, subscriptionId] of connInfo.subscriptions) {
            try {
              const checkId = `${subscriptionId}-${Date.now()}`;
              this.log("debug", "Sending heartbeat activity check", {
                path,
                subscriptionId,
                checkId,
              });
              ws.send(JSON.stringify({ type: "activity_check", checkId, path, subscriptionId }));
            } catch {}
          }
        }
      }
    }, this.PING_INTERVAL);
  }

  private checkActivity(ws: ServerWebSocket, subscriptionId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const conn = this.activeConnections.get(ws);

      if (conn?.subscriptions.has(subscriptionId)) {
        this.log("debug", "Activity check: connection active", { subscriptionId });
        resolve(true);
        return;
      }

      const pending = this.pendingDisconnections.get(subscriptionId);
      if (pending) {
        this.log("debug", "Activity check: in reconnect grace period - waiting for reconnection", {
          subscriptionId,
        });
        const waitTimeout = setTimeout(() => {
          resolve(false);
        }, this.RECONNECT_GRACE_PERIOD);

        const checkReconnect = setInterval(() => {
          const updatedConn = this.activeConnections.get(ws);
          if (updatedConn?.subscriptions.has(subscriptionId)) {
            clearTimeout(waitTimeout);
            clearInterval(checkReconnect);
            this.log("debug", "Activity check: reconnected successfully", { subscriptionId });
            resolve(true);
          }
        }, 100);

        return;
      }

      if (!conn) {
        this.log("debug", "Activity check: no connection found", { subscriptionId });
        resolve(false);
        return;
      }

      const checkId = `${subscriptionId}-${Date.now()}`;
      const timeout = setTimeout(() => {
        this.log("warn", "Activity check timeout", { checkId, subscriptionId });
        this.pendingActivityChecks.delete(checkId);
        resolve(false);
      }, this.ACTIVITY_CHECK_TIMEOUT);

      this.pendingActivityChecks.set(checkId, { resolve, timeout });

      try {
        this.log("debug", "Sending activity check", { checkId });
        ws.send(JSON.stringify({ type: "activity_check", checkId }));
      } catch {
        clearTimeout(timeout);
        this.pendingActivityChecks.delete(checkId);
        this.log("error", "Failed to send activity check - connection likely closed", { checkId });
        resolve(false);
      }
    });
  }

  private createWebSocketHandlers() {
    return {
      message: async (ws: ServerWebSocket, message: string | ArrayBuffer | Uint8Array) => {
        const standardWsHandler = this.wsRoutes.get(ws.data?.__wsPath);
        if (standardWsHandler?.message) {
          standardWsHandler.message(ws, message);
        }

        let subMessage;
        try {
          subMessage = JSON.parse(message.toString());
        } catch {
          return;
        }

        if (subMessage.type === "activity_check_response" && subMessage.checkId) {
          this.log("debug", "Activity check response received", {
            checkId: subMessage.checkId,
            path: subMessage.path,
            subscriptionId: subMessage.subscriptionId,
          });
          const connInfo = this.activeConnections.get(ws);
          if (connInfo) {
            connInfo.lastPong = Date.now();
          }
          const pending = this.pendingActivityChecks.get(subMessage.checkId);
          if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve(true);
            this.pendingActivityChecks.delete(subMessage.checkId);
          }
          return;
        }

        const { type, path, headers, query, body, subscriptionId } = subMessage;
        if (!type || !path) {
          return;
        }

        const subMatch = this.router.find("SUB", path);
        if (!subMatch) {
          return;
        }

        const matchedSub = subMatch.handler as {
          handler: SubscriptionHandler;
          schema: RouteSchema;
        };
        const rawParams: Record<string, string> = subMatch.params;

        const topic = path;

        if (type === "subscribe") {
          let validatedParams = rawParams || {};
          if (matchedSub.schema.params) {
            const result = matchedSub.schema.params["~standard"].validate(
              rawParams,
            ) as StandardSchemaV1.Result<any>;
            if ("issues" in result) {
              return;
            }
            validatedParams = result.value;
          }

          let validatedQuery = query || {};
          if (matchedSub.schema.query && query) {
            const result = matchedSub.schema.query["~standard"].validate(
              query,
            ) as StandardSchemaV1.Result<any>;
            if ("issues" in result) {
              console.error("Validation error (query):", result.issues);
              return;
            }
            validatedQuery = result.value;
          }

          let validatedHeaders = headers || {};
          if (this.defaultHeaders) {
            const globalResult = this.defaultHeaders["~standard"].validate(
              headers || {},
            ) as StandardSchemaV1.Result<any>;
            if (globalResult && "value" in globalResult) {
              validatedHeaders = { ...validatedHeaders, ...globalResult.value };
            }
          }
          if (matchedSub.schema.headers && headers) {
            const result = matchedSub.schema.headers["~standard"].validate(
              headers,
            ) as StandardSchemaV1.Result<any>;
            if ("issues" in result) {
              console.error("Validation error (headers):", result.issues);
              ws.send(
                JSON.stringify({
                  path: topic,
                  error: { message: "Validation error", issues: result.issues },
                  subscriptionId: subscriptionId,
                }),
              );
              return;
            }
            validatedHeaders = { ...validatedHeaders, ...result.value };
          }

          ws.subscribe(topic);
          ws.data.subscribedTopics?.add(topic);
          if (!this.activeConnections.has(ws)) {
            this.activeConnections.set(ws, {
              lastPong: Date.now(),
              subscriptions: new Map(),
            });
          }
          const connInfo = this.activeConnections.get(ws)!;
          connInfo.subscriptions.set(topic, subscriptionId);

          const pendingKey = subscriptionId;
          const pending = this.pendingDisconnections.get(pendingKey);
          if (pending) {
            this.log("debug", "Client reconnected, canceling disconnection timeout", {
              path: topic,
              subscriptionId,
            });
            clearTimeout(pending.timeout);
            this.pendingDisconnections.delete(pendingKey);
          } else {
            this.log("debug", "New subscription", { path: topic, subscriptionId });
          }

          const isActive = async (): Promise<boolean> => {
            return this.checkActivity(ws, subscriptionId);
          };
          const publish = (payload: any, targetId?: string) => {
            const messagePayload = {
              path: topic,
              ...(payload &&
              typeof payload === "object" &&
              ("data" in payload || "error" in payload)
                ? payload
                : { data: payload }),
              subscriptionId: targetId || subscriptionId,
            };
            const msg = JSON.stringify(messagePayload);
            if (targetId) {
              ws.send(msg);
            } else {
              ws.publish(topic, msg);
            }
          };

          if (!pending) {
            await Promise.all(
              this.onSubscriptionOpenHandlers.map(async (handler) => {
                try {
                  await handler({ path: topic, subscriptionId, ws, isActive, publish });
                } catch (e) {
                  console.error("[WS] Error in subscriptionOpen handler:", e);
                }
              }),
            );
          }
          const ctx: SubscriptionContext<any> = {
            ws,
            req: ws.data.request,
            params: validatedParams,
            query: validatedQuery,
            headers: validatedHeaders,
            rawHeaders: headers || {},
            body: body,
            route: path,
            method: "SUB",
            data: undefined,
            errorData: undefined,
            subscriptionId,
            isActive,
            publish: this.publish,
            error: (statusCode: number, message?: string): never => {
              throw { statusCode, message: message || "Error" };
            },
            sendData: (data: any, targetId?: string) => {
              const connInfo = this.activeConnections.get(ws);
              if (!connInfo?.subscriptions.has(topic)) {
                return;
              }
              try {
                const msg = JSON.stringify({
                  path: topic,
                  data,
                  subscriptionId: targetId || subscriptionId,
                });
                ws.send(msg);
              } catch {}
            },
            sendError: (error: any, targetId?: string) => {
              const connInfo = this.activeConnections.get(ws);
              if (!connInfo?.subscriptions.has(topic)) {
                return;
              }
              try {
                const msg = JSON.stringify({
                  path: topic,
                  error,
                  subscriptionId: targetId || subscriptionId,
                });
                ws.send(msg);
              } catch {}
            },
            onMessage: (callback: (message: any) => void | Promise<void>) => {
              this.messageHandlers.set(subscriptionId, {
                callback,
                schema: matchedSub.schema.message,
              });
            },
          };

          if (!pending) {
            try {
              const result = await matchedSub.handler(ctx);
              if (result !== undefined) {
                ws.send(JSON.stringify({ path: topic, data: result, subscriptionId }));
              }
            } catch (e: any) {
              const error = {
                message: e.message || "Internal Server Error",
                code: e.statusCode || 500,
              };
              ws.send(JSON.stringify({ path: topic, error, subscriptionId }));
            }
          }
        } else if (type === "message") {
          this.log("debug", "Message received on subscription", { path: topic, subscriptionId });
          const { data } = subMessage;
          const isActive = async (): Promise<boolean> => {
            return this.checkActivity(ws, subscriptionId);
          };
          const sendData = (responseData: any) => {
            const connInfo = this.activeConnections.get(ws);
            if (!connInfo?.subscriptions.has(topic)) {
              return;
            }
            try {
              ws.send(JSON.stringify({ path: topic, data: responseData, subscriptionId }));
            } catch {}
          };
          const sendError = (error: any) => {
            const connInfo = this.activeConnections.get(ws);
            if (!connInfo?.subscriptions.has(topic)) {
              return;
            }
            try {
              ws.send(JSON.stringify({ path: topic, error, subscriptionId }));
            } catch {}
          };

          let validatedData = data;
          const handlerInfo = this.messageHandlers.get(subscriptionId);
          if (handlerInfo) {
            let validationResult = handlerInfo.schema["~standard"].validate(data);
            if (validationResult instanceof Promise) {
              validationResult = await validationResult;
            }

            if ("issues" in validationResult) {
              console.error("[WS] Message validation error:", validationResult.issues);
              return;
            }

            validatedData = validationResult.value;
            try {
              await handlerInfo.callback(validatedData);
            } catch (e) {
              console.error("Error processing subscription message:", e);
            }
          }

          await Promise.all(
            this.onSubscriptionMessageHandlers.map(async (h) => {
              try {
                await h({
                  path: topic,
                  subscriptionId,
                  ws,
                  message: validatedData,
                  isActive,
                  sendData,
                  sendError,
                });
              } catch (e) {
                console.error("[WS] Error in subscriptionMessage handler:", e);
              }
            }),
          );
        } else if (type === "unsubscribe") {
          this.log("debug", "Unsubscribe request", { path: topic, subscriptionId });
          ws.unsubscribe(topic);
          ws.data.subscribedTopics?.delete(topic);
          const connInfo = this.activeConnections.get(ws);
          if (connInfo) {
            const subId = connInfo.subscriptions.get(topic);
            connInfo.subscriptions.delete(topic);
            if (subId) {
              const isActive = async () => false;
              const publish = (data: any, targetId?: string) => {
                const msg = JSON.stringify({
                  path: topic,
                  data,
                  subscriptionId: targetId || subId,
                });
                if (targetId) {
                  ws.send(msg);
                } else {
                  ws.publish(topic, msg);
                }
              };
              await Promise.all(
                this.onSubscriptionCloseHandlers.map(async (handler) => {
                  try {
                    await handler({
                      path: topic,
                      subscriptionId: subId,
                      ws,
                      reason: "unsubscribe",
                      isActive,
                      publish,
                    });
                  } catch (e) {
                    console.error("[WS] Error in subscriptionClose handler:", e);
                  }
                }),
              );
            }
          }
        }
      },
      open: (ws: ServerWebSocket) => {
        const handler = this.wsRoutes.get(ws.data?.__wsPath);
        if (handler?.open) {
          handler.open(ws);
        }
        if (!this.activeConnections.has(ws)) {
          this.activeConnections.set(ws, {
            lastPong: Date.now(),
            subscriptions: new Map(),
          });
        }
      },
      close: async (ws: ServerWebSocket, code: number, reason: string) => {
        this.log("debug", "WebSocket closed", { code, reason });
        const handler = this.wsRoutes.get(ws.data?.__wsPath);
        if (handler?.close) {
          handler.close(ws, code, reason);
        }
        const connInfo = this.activeConnections.get(ws);
        if (connInfo) {
          for (const [path, subscriptionId] of connInfo.subscriptions.entries()) {
            const pendingKey = subscriptionId;
            this.log("debug", "Subscription client disconnected, starting grace period", {
              path,
              subscriptionId,
            });

            const timeout = setTimeout(async () => {
              this.log("warn", "Grace period timeout, closing subscription", {
                path,
                subscriptionId,
              });
              this.pendingDisconnections.delete(pendingKey);

              const isActive = async () => false;
              const publish = (data: any, targetId?: string) => {
                const msg = JSON.stringify({
                  path,
                  data,
                  subscriptionId: targetId || subscriptionId,
                });
                if (targetId) {
                  try {
                    ws.send(msg);
                  } catch {}
                } else {
                  try {
                    ws.publish(path, msg);
                  } catch {}
                }
              };

              await Promise.all(
                this.onSubscriptionCloseHandlers.map(async (closeHandler) => {
                  try {
                    await closeHandler({
                      path,
                      subscriptionId,
                      ws,
                      reason: "disconnect",
                      isActive,
                      publish,
                    });
                  } catch (e) {
                    console.error("[WS] Error in subscriptionClose handler:", e);
                  }
                }),
              );
            }, this.RECONNECT_GRACE_PERIOD);

            this.pendingDisconnections.set(pendingKey, {
              timeout,
              path,
              subscriptionId,
              ws,
            });
          }
          this.activeConnections.delete(ws);
        }
      },
      error: (ws: ServerWebSocket, error: Error) => {
        const handler = this.wsRoutes.get(ws.data?.__wsPath);
        if (handler?.error) {
          handler.error(ws, error);
        }
      },
      drain: (ws: ServerWebSocket) => {
        const handler = this.wsRoutes.get(ws.data?.__wsPath);
        if (handler?.drain) {
          handler.drain(ws);
        }
      },
    };
  }

  private createResponseContext(): ResponseContext {
    const responseData = {
      statusCode: 200,
      responseHeaders: new Headers(),
      cookies: new Map<string, { value: string; options?: CookieOptions }>(),
      modified: false,
    };

    const headersAPI = {
      set: (key: string, value: string) => {
        responseData.responseHeaders.set(key, value);
        responseData.modified = true;
        return context;
      },
      get: (key: string) => responseData.responseHeaders.get(key),
      delete: (key: string) => {
        responseData.responseHeaders.delete(key);
        responseData.modified = true;
        return context;
      },
      add: (key: string, value: string) => {
        const existing = responseData.responseHeaders.get(key);
        if (existing) {
          responseData.responseHeaders.set(key, `${existing}, ${value}`);
        } else {
          responseData.responseHeaders.set(key, value);
        }
        responseData.modified = true;
        return context;
      },
    };

    const cookiesAPI = {
      get: (name: string) => responseData.cookies.get(name)?.value,
      set: (name: string, value: string, options?: CookieOptions) => {
        responseData.cookies.set(name, { value, options });
        responseData.modified = true;
        return context;
      },
      delete: (name: string, options?: Omit<CookieOptions, "expires">) => {
        responseData.cookies.set(name, {
          value: "",
          options: { ...options, expires: new Date(0) },
        });
        responseData.modified = true;
        return context;
      },
    };

    const context: ResponseContext = {
      status: (code: number) => {
        responseData.statusCode = code;
        responseData.modified = true;
        return context;
      },
      headers: headersAPI,
      cookies: cookiesAPI,
    };

    (context as any).__responseData = responseData;
    return context;
  }

  private async applyCorsHeaders(response: Response, req: Request): Promise<Response> {
    if (!this.cors) {
      return response;
    }

    const corsHeaders = await generateCorsHeaders(this.cors, req);

    if (Object.keys(corsHeaders).length === 0) {
      return response;
    }

    const finalHeaders = new Headers(response.headers);
    for (const key in corsHeaders) {
      finalHeaders.set(key, String(corsHeaders[key]));
    }

    if (corsHeaders["Access-Control-Allow-Origin"] && !finalHeaders.has("Vary")) {
      finalHeaders.append("Vary", "Origin");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: finalHeaders,
    });
  }

  private applyResponseContext(response: Response, setContext: ResponseContext): Response {
    const responseData = (setContext as any).__responseData;
    if (!responseData?.modified) {
      return response;
    }

    const newHeaders = new Headers(response.headers);

    responseData.responseHeaders.forEach((value: string, key: string) => {
      newHeaders.set(key, value);
    });

    const cookiesSize = responseData.cookies.size;
    if (cookiesSize > 0) {
      responseData.cookies.forEach(
        (cookieData: { value: string; options?: CookieOptions }, name: string) => {
          const { value, options } = cookieData;
          let cookieString = `${name}=${value}`;

          if (options?.path) {
            cookieString += `; Path=${options.path}`;
          }
          if (options?.domain) {
            cookieString += `; Domain=${options.domain}`;
          }
          if (options?.expires) {
            cookieString += `; Expires=${options.expires.toUTCString()}`;
          }
          if (options?.maxAge) {
            cookieString += `; Max-Age=${options.maxAge}`;
          }
          if (options?.httpOnly) {
            cookieString += "; HttpOnly";
          }
          if (options?.secure) {
            cookieString += "; Secure";
          }
          if (options?.sameSite) {
            cookieString += `; SameSite=${options.sameSite}`;
          }

          newHeaders.append("Set-Cookie", cookieString);
        },
      );
    }

    responseData.modified = false;
    responseData.responseHeaders.forEach((_: string, key: string) => {
      responseData.responseHeaders.delete(key);
    });
    responseData.cookies.clear();

    return new Response(response.body, {
      status: responseData.statusCode !== 200 ? responseData.statusCode : response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  private createAssertion(value: any, negated = false): Assertion {
    const self = this;
    const check = (condition: boolean, message: string) => {
      if (negated ? condition : !condition) {
        throw new Error(message);
      }
    };

    return {
      toBe(expected: any) {
        check(
          value === expected,
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} be ${JSON.stringify(expected)}\n\n  Received: ${JSON.stringify(value)}\n  Expected: ${JSON.stringify(expected)}`,
        );
      },
      toEqual(expected: any) {
        const isEqual = JSON.stringify(value) === JSON.stringify(expected);
        check(
          isEqual,
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} equal ${JSON.stringify(expected)}\n\n  Received: ${JSON.stringify(value)}\n  Expected: ${JSON.stringify(expected)}`,
        );
      },
      toStrictEqual(expected: any) {
        const isEqual =
          JSON.stringify(value) === JSON.stringify(expected) && typeof value === typeof expected;
        check(
          isEqual,
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} strictly equal ${JSON.stringify(expected)}`,
        );
      },
      toBeTruthy() {
        check(!!value, `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} be truthy`);
      },
      toBeFalsy() {
        check(!value, `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} be falsy`);
      },
      toBeDefined() {
        check(value !== undefined, `Expected value to${negated ? " not" : ""} be defined`);
      },
      toBeUndefined() {
        check(value === undefined, `Expected value to${negated ? " not" : ""} be undefined`);
      },
      toBeNull() {
        check(
          value === null,
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} be null`,
        );
      },
      toBeNaN() {
        check(
          Number.isNaN(value),
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} be NaN`,
        );
      },
      toBeFinite() {
        check(
          Number.isFinite(value),
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} be finite`,
        );
      },
      toBeInfinite() {
        check(
          value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY,
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} be infinite`,
        );
      },
      toContain(item: any) {
        const contains = Array.isArray(value)
          ? value.includes(item)
          : typeof value === "string"
            ? value.includes(item)
            : false;
        check(
          contains,
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} contain ${JSON.stringify(item)}`,
        );
      },
      toHaveLength(length: number) {
        check(
          value?.length === length,
          `Expected length ${value?.length} to${negated ? " not" : ""} be ${length}`,
        );
      },
      toHaveProperty(key: string) {
        check(
          value != null && key in value,
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} have property "${key}"`,
        );
      },
      toMatch(pattern: RegExp | string) {
        const matches =
          pattern instanceof RegExp
            ? pattern.test(value)
            : typeof value === "string" && value.includes(pattern);
        check(
          matches,
          `Expected ${JSON.stringify(value)} to${negated ? " not" : ""} match ${pattern}`,
        );
      },
      toThrow() {
        let threw = false;
        try {
          if (typeof value === "function") {
            value();
          }
        } catch {
          threw = true;
        }
        check(threw, `Expected function to${negated ? " not" : ""} throw`);
      },
      toBeGreaterThan(expected: number) {
        check(
          value > expected,
          `Expected ${value} to${negated ? " not" : ""} be greater than ${expected}`,
        );
      },
      toBeLessThan(expected: number) {
        check(
          value < expected,
          `Expected ${value} to${negated ? " not" : ""} be less than ${expected}`,
        );
      },
      toBeGreaterThanOrEqual(expected: number) {
        check(
          value >= expected,
          `Expected ${value} to${negated ? " not" : ""} be greater than or equal to ${expected}`,
        );
      },
      toBeLessThanOrEqual(expected: number) {
        check(
          value <= expected,
          `Expected ${value} to${negated ? " not" : ""} be less than or equal to ${expected}`,
        );
      },
      toBeCloseTo(expected: number, decimals = 2) {
        const precision = 10 ** decimals;
        const isClose = Math.round(value * precision) === Math.round(expected * precision);
        check(
          isClose,
          `Expected ${value} to${negated ? " not" : ""} be close to ${expected} (within ${decimals} decimal places)`,
        );
      },
      toBeInstanceOf(expected: any) {
        const isInstance = value instanceof expected;
        check(
          isInstance,
          `Expected ${value} to${negated ? " not" : ""} be instance of ${expected.name}`,
        );
      },
      toHaveBeenCalled() {
        const called = Array.isArray(value?.calls) && value.calls.length > 0;
        check(called, `Expected function to${negated ? " not" : ""} have been called`);
      },
      toHaveBeenCalledWith(...args: any[]) {
        const calls = Array.isArray(value?.calls) ? value.calls : [];
        const wasCalled = calls.some(
          (callArgs: any[]) => JSON.stringify(callArgs) === JSON.stringify(args),
        );
        check(
          wasCalled,
          `Expected function to${negated ? " not" : ""} have been called with ${JSON.stringify(args)}`,
        );
      },
      toHaveBeenCalledTimes(expected: number) {
        const callCount = Array.isArray(value?.calls) ? value.calls.length : 0;
        check(
          callCount === expected,
          `Expected function to${negated ? " not" : ""} have been called ${expected} times, but was called ${callCount} times`,
        );
      },
      toHaveReturnedWith(expected: any) {
        const returns = Array.isArray(value?.returns) ? value.returns : [];
        const hasReturned = returns.some(
          (returnValue: any) => JSON.stringify(returnValue) === JSON.stringify(expected),
        );
        check(
          hasReturned,
          `Expected function to${negated ? " not" : ""} have returned ${JSON.stringify(expected)}`,
        );
      },
      toHaveReturnedTimes(expected: number) {
        const returnCount = Array.isArray(value?.returns) ? value.returns.length : 0;
        check(
          returnCount === expected,
          `Expected function to${negated ? " not" : ""} have returned ${expected} times, but returned ${returnCount} times`,
        );
      },
      get not(): Assertion {
        return self.createAssertion(value, !negated);
      },
    };
  }

  /**
   * Run all route tests and return results
   * @returns {Promise<{ passed: number; failed: number; total: number; report: string; results: Array<{ path: string; method: string; passed: boolean; error?: string; duration: number; assertions: number }> }>}
   */
  async runTests(): Promise<{
    passed: number;
    failed: number;
    total: number;
    report: string;
    results: Array<{
      path: string;
      method: string;
      passed: boolean;
      error?: string;
      duration: number;
      assertions: number;
    }>;
  }> {
    const routesWithTests = this.routes.filter((r) => r.test);
    const results: Array<{
      path: string;
      method: string;
      passed: boolean;
      error?: string;
      duration: number;
      assertions: number;
    }> = [];

    for (const route of routesWithTests) {
      const start = performance.now();
      let assertionCount = 0;

      const createRequest = async (data: {
        params?: Record<string, any>;
        query?: Record<string, any>;
        body?: any;
        headers?: Record<string, string>;
      }) => {
        let path = route.path;
        if (data.params) {
          for (const [key, val] of Object.entries(data.params)) {
            path = path.replace(`:${key}`, String(val));
          }
        }

        let url = `http://localhost${path}`;
        if (data.query) {
          const queryParams: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.query)) {
            queryParams[k] = String(v);
          }
          url += `?${new URLSearchParams(queryParams).toString()}`;
        }

        const init: RequestInit = {
          method: route.method,
          headers: {
            ...(data.body ? { "Content-Type": "application/json" } : {}),
            ...data.headers,
          },
        };

        if (data.body !== undefined && route.method !== "GET") {
          init.body = JSON.stringify(data.body);
        }

        const req = new Request(url, init);
        const res = await this.fetch(req);
        const statusCode = res.status;
        const ok = res.ok;

        let response: any;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          response = await res.json();
        } else {
          response = await res.text();
        }

        return { response, statusCode, ok };
      };

      const expect = (value: any) => {
        assertionCount++;
        return this.createAssertion(value);
      };

      const assert = (condition: boolean, message?: string) => {
        assertionCount++;
        if (!condition) {
          throw new Error(message || "Assertion failed");
        }
      };

      const assertEqual = (actual: any, expected: any, message?: string) => {
        assertionCount++;
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(
            message || `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`,
          );
        }
      };

      const assertThrows = async (fn: () => Promise<void>) => {
        assertionCount++;
        let threw = false;
        try {
          await fn();
        } catch {
          threw = true;
        }
        if (!threw) {
          throw new Error("Expected function to throw");
        }
      };

      try {
        await route.test!({
          createRequest,
          expect,
          assert,
          assertEqual,
          assertThrows,
          path: route.path,
          method: route.method,
        });
        results.push({
          path: route.path,
          method: route.method,
          passed: true,
          duration: performance.now() - start,
          assertions: assertionCount,
        });
      } catch (err: any) {
        results.push({
          path: route.path,
          method: route.method,
          passed: false,
          error: err.message || String(err),
          duration: performance.now() - start,
          assertions: assertionCount,
        });
      }
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;
    const totalAssertions = results.reduce((sum, r) => sum + r.assertions, 0);
    const passedAssertions = results
      .filter((r) => r.passed)
      .reduce((sum, r) => sum + r.assertions, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    let report = "\n🧪 Route Tests Report\n";
    report += `${"═".repeat(65)}\n\n`;

    for (const result of results) {
      if (result.passed) {
        report += `✅ ${result.method} ${result.path}\n`;
        report += `   └─ ${result.assertions} assertion${result.assertions !== 1 ? "s" : ""} passed in ${Math.round(result.duration)}ms\n\n`;
      } else {
        report += `❌ ${result.method} ${result.path}\n`;
        report += `   └─ Test failed in ${Math.round(result.duration)}ms\n`;
        report += `      ${result.error}\n\n`;
      }
    }

    report += `${"═".repeat(65)}\n\n`;
    report += `Tests: ${passed} passed, ${failed} failed, ${total} total\n`;
    report += `Assertions: ${passedAssertions} passed, ${totalAssertions - passedAssertions} failed, ${totalAssertions} total\n`;
    report += `Duration: ${Math.round(totalDuration)}ms\n`;
    report += `Status: ${failed === 0 ? "PASSED ✓" : "FAILED ✗"}\n`;

    return { passed, failed, total, report, results };
  }

  /**
   * Stop HTTP server
   * @returns {void}
   */
  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.activeConnections.clear();
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  /**
   * Throw error with status code and message
   * @param {number} statusCode - Error status code
   * @param {string} message - Error message
   * @returns {never} Never type
   */
  error(statusCode: number, message: string): never {
    throw { statusCode, message };
  }
}
