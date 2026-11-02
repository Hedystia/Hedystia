import { generateTypes } from "@hedystia/types";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import Core from "./core";
import generateCorsHeaders from "./handlers/cors";
import processGenericHandlers from "./handlers/generic";
import { Router } from "./router";
import { serve as serveUnified, type UnifiedServer } from "./runtime";
import {
  applySecurityResponse,
  assertRequestLimits,
  consumeRateLimit,
  getRequestId,
  MemoryRateLimitStore,
  mergeSecurityOptions,
  RateLimitError,
  SecurityInputError,
  type SecurityOptions,
  sanitizeInput,
  withTimeout,
} from "./security";
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
import {
  createLogger,
  type DebugLevel,
  determineContentType,
  isBunHTMLBundle,
  limitRequestBody,
  parseBodyFromText,
  parseRequestBody,
  readLimitedBytes,
} from "./utils";

const SHARED_TEXT_ENCODER = new TextEncoder();
const EMPTY_SECURITY_STATE: SecurityRequestState = {};

class FullRequestContext {
  public req!: Request;
  public params!: Record<string, string>;
  public query: Record<string, string>;
  public body: any;
  public rawBody: any;
  public route: string;
  public method: string;
  public publish: any;
  public requestId?: unknown;
  public streamResponse: Response | null = null;

  private _raw: Record<string, string> | null = null;
  private _validatedHeaders: Record<string, string> | null = null;
  private _set: ResponseContext | null = null;
  private _stream: StreamContext | null = null;
  private _streamState: {
    controller: ReadableStreamDefaultController | null;
    stream: ReadableStream<Uint8Array> | null;
  } | null = null;
  private makeSet: () => ResponseContext;

  constructor(
    req: Request,
    params: Record<string, string>,
    query: Record<string, string>,
    body: any,
    rawBody: any,
    route: string,
    method: string,
    publish: any,
    makeSet: () => ResponseContext,
  ) {
    this.req = req;
    this.params = params;
    this.query = query;
    this.body = body;
    this.rawBody = rawBody;
    this.route = route;
    this.method = method;
    this.publish = publish;
    this.makeSet = makeSet;
  }

  initHeaders(raw: Record<string, string>, validated: Record<string, string> | null): void {
    this._raw = raw;
    this._validatedHeaders = validated;
  }

  get rawHeaders(): Record<string, string> {
    if (this._raw === null) {
      this._raw = buildRawHeaders(this.req);
    }
    return this._raw;
  }

  set rawHeaders(value: Record<string, string>) {
    this._raw = value;
  }

  get headers(): Record<string, string> {
    if (this._validatedHeaders !== null) {
      return this._validatedHeaders;
    }
    return this.rawHeaders;
  }

  set headers(value: Record<string, string>) {
    this._validatedHeaders = value;
  }

  get set(): ResponseContext {
    if (this._set === null) {
      this._set = this.makeSet();
    }
    return this._set;
  }

  set set(value: ResponseContext) {
    this._set = value;
  }

  get hasSet(): boolean {
    return this._set !== null;
  }

  get stream(): StreamContext {
    if (this._stream) {
      return this._stream;
    }

    if (!this._streamState) {
      this._streamState = {
        controller: null,
        stream: null,
      };
    }
    const streamState = this._streamState;
    const streamContext: StreamContext = {
      write: (chunk: string | Uint8Array) => {
        if (!streamState.stream) {
          streamState.stream = new ReadableStream({
            start(controller) {
              streamState.controller = controller;
            },
          });
          this.streamResponse = new Response(streamState.stream, {
            headers: { "Content-Type": "text/plain" },
          });
        }
        if (streamState.controller) {
          try {
            streamState.controller.enqueue(
              typeof chunk === "string" ? SHARED_TEXT_ENCODER.encode(chunk) : chunk,
            );
          } catch {}
        }
        return streamContext;
      },
      end: (chunk?: string | Uint8Array) => {
        if (chunk != null) {
          streamContext.write(chunk);
        }
        if (streamState.controller) {
          try {
            streamState.controller.close();
          } catch {}
        }
      },
    };
    this._stream = streamContext;
    return streamContext;
  }

  set stream(value: StreamContext) {
    this._stream = value;
  }

  error(statusCode: number, message?: string): never {
    throw { statusCode, message: message || "Error" };
  }
}

function buildRawHeaders(req: Request): Record<string, string> {
  const rawHeaders: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    rawHeaders[k.toLowerCase()] = v;
  });
  return rawHeaders;
}

function parseQuery(url: string): Record<string, string> {
  const qi = url.indexOf("?");
  if (qi === -1) {
    return {};
  }
  const out: Record<string, string> = {};
  const pairs = url.split("?", 2)[1] ?? "";
  if (!pairs) {
    return out;
  }
  for (const pair of pairs.split("&")) {
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf("=");
    let key: string;
    let value: string;
    if (eq === -1) {
      key = pair;
      value = "";
    } else {
      key = pair.substring(0, eq);
      value = pair.substring(eq + 1);
    }
    if (key.indexOf("%") !== -1) {
      try {
        key = decodeURIComponent(key);
      } catch {}
    }
    if (value.indexOf("%") !== -1) {
      try {
        value = decodeURIComponent(value);
      } catch {}
    } else if (value.indexOf("+") !== -1) {
      value = value.replace(/\+/g, " ");
    }
    out[key] = value;
  }
  return out;
}

interface FrameworkOptions<
  H extends ValidationSchema | undefined = undefined,
  P extends ValidationSchema | undefined = undefined,
  Q extends ValidationSchema | undefined = undefined,
  B extends ValidationSchema | undefined = undefined,
> {
  reusePort?: boolean;
  cors?: CorsOptions | boolean;
  idleTimeout?: number;
  sse?: boolean;
  debugLevel?: DebugLevel;
  headers?: H;
  params?: P;
  query?: Q;
  body?: B;
  security?: SecurityOptions;
}

type WebSocketData = {
  __wsPath?: string;
  request?: Request;
  subscribedTopics?: Set<string>;
};

type SecurityRequestState = {
  requestId?: string;
  rateLimit?: { limit: number; count: number; resetAt: number };
  rejection?: Response;
};

export class Hedystia<
  Routes extends RouteDefinition[] = [],
  _Macros extends MacroData = {},
  GlobalHeaders extends ValidationSchema | undefined = undefined,
  GlobalParams extends ValidationSchema | undefined = undefined,
  GlobalQuery extends ValidationSchema | undefined = undefined,
  GlobalBody extends ValidationSchema | undefined = undefined,
> extends Core<Routes, _Macros, GlobalHeaders, GlobalParams, GlobalQuery, GlobalBody> {
  private reusePort: boolean;
  private idleTimeout: number;
  private router = new Router();
  private staticRoutesFast: Map<string, (req: Request) => any> = new Map();
  private isCompiled = false;
  private log: ReturnType<typeof createLogger>;
  private defaultHeaders: ValidationSchema | undefined;
  private security: SecurityOptions;
  private readonly rateLimitStore: MemoryRateLimitStore;

  /**
   * Returns the global security configuration for framework composition.
   * @returns {SecurityOptions} Global security options
   */
  public get securityOptions(): SecurityOptions {
    return this.security;
  }

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

  constructor(options?: FrameworkOptions<GlobalHeaders, GlobalParams, GlobalQuery, GlobalBody>) {
    super();
    this.reusePort = options?.reusePort ?? false;
    this.cors =
      options?.cors === false ? undefined : options?.cors === true ? {} : (options?.cors ?? {});
    this.idleTimeout = options?.idleTimeout ?? 10;
    this.sseMode = options?.sse ?? false;
    this.log = createLogger(options?.debugLevel ?? "none");
    this.defaultHeaders = options?.headers;
    this.globals.headers = options?.headers;
    this.globals.params = options?.params;
    this.globals.query = options?.query;
    this.globals.body = options?.body;
    this.security = options?.security ?? {};
    this.rateLimitStore = new MemoryRateLimitStore();
  }

  static createResponse(
    data: any,
    contentType?: string,
    extraHeaders?: Record<string, string>,
  ): Response {
    if (data instanceof Response) {
      return data;
    }

    if (data instanceof ReadableStream) {
      const fallback: Record<string, string> = contentType ? { "Content-Type": contentType } : {};
      return new Response(data, {
        headers: extraHeaders ? { ...fallback, ...extraHeaders } : fallback,
      });
    }

    if (contentType === "text/plain" || typeof data === "string") {
      const resolvedType = contentType || determineContentType(data);
      const internal = extraHeaders && Object.getPrototypeOf(extraHeaders) === null;
      const headers: Record<string, string> = internal
        ? (extraHeaders as Record<string, string>)
        : extraHeaders
          ? { ...extraHeaders }
          : {};
      if (!headers["content-type"]) {
        headers["content-type"] = resolvedType;
      }
      return new Response(data, { status: 200, headers });
    }
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      return new Response(data as any, { headers: extraHeaders });
    }
    if (data instanceof Blob) {
      return new Response(data, { headers: extraHeaders });
    }
    if (data instanceof FormData) {
      return new Response(data, { headers: extraHeaders });
    }

    if (isBunHTMLBundle(data)) {
      const anyBun = (globalThis as any).Bun;
      if (anyBun) {
        return new Response(anyBun.file(data.index));
      }
    }

    if (extraHeaders) {
      const headers = { ...extraHeaders };
      if (!headers["content-type"]) {
        headers["content-type"] = "application/json";
      }
      return new Response(JSON.stringify(data), { status: 200, headers });
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
    const hasBody: boolean =
      route.method === "PATCH" ||
      route.method === "POST" ||
      route.method === "PUT" ||
      route.method === "DELETE";
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
    const globalParamsSchema = this.globals.params;
    const globalQuerySchema = this.globals.query;
    const globalBodySchema = hasBody ? this.globals.body : undefined;
    const routeSecurity = mergeSecurityOptions(this.security, route.schema.security);
    const hasRequestLimits: boolean =
      routeSecurity.bodyLimit !== undefined ||
      routeSecurity.maxQueryParameters !== undefined ||
      routeSecurity.maxQueryDepth !== undefined;

    const isSyncCandidate: boolean =
      !paramsSchema &&
      !querySchema &&
      !headersSchema &&
      !bodySchema &&
      !errorSchema &&
      !globalParamsSchema &&
      !globalQuerySchema &&
      !globalBodySchema &&
      !hasBody &&
      hooks.onRequest.length === 0 &&
      hooks.onParse.length === 0 &&
      hooks.onTransform.length === 0 &&
      hooks.onBeforeHandle.length === 0 &&
      hooks.onAfterHandle.length === 0 &&
      hooks.onMapResponse.length === 0 &&
      hooks.onAfterResponse.length === 0 &&
      hooks.onError.length === 0 &&
      !routeSecurity.rateLimit &&
      !routeSecurity.sanitize &&
      !routeSecurity.requestId &&
      !routeSecurity.timeout &&
      !hasRequestLimits;

    if (isSyncCandidate) {
      const noSecurity = !routeSecurity.headers;
      const server = this;
      const publish = this.publish;
      const routePath = route.path;
      const routeMethod = route.method;

      class SyncContext {
        public req: Request;
        public params: Record<string, string>;

        private _raw: Record<string, string> | null = null;
        private _set: ResponseContext | null = null;
        private _stream: StreamContext | null = null;
        private _streamResponse: Response | null = null;

        constructor(req: Request, params: Record<string, string>) {
          this.req = req;
          this.params = params;
        }

        get rawHeaders(): Record<string, string> {
          if (this._raw === null) {
            this._raw = buildRawHeaders(this.req);
          }
          return this._raw;
        }

        set rawHeaders(value: Record<string, string>) {
          this._raw = value;
        }

        get headers(): Record<string, string> {
          return this.rawHeaders;
        }

        set headers(value: Record<string, string>) {
          this._raw = value;
        }

        get query(): Record<string, string> {
          return parseQuery(this.req.url);
        }

        get route(): string {
          return routePath;
        }

        get method(): string {
          return routeMethod;
        }

        get publish() {
          return publish;
        }

        get set(): ResponseContext {
          if (this._set === null) {
            this._set = server.createResponseContext();
          }
          return this._set;
        }

        set set(value: ResponseContext) {
          this._set = value;
        }

        get stream(): StreamContext {
          if (this._stream) {
            return this._stream;
          }

          const streamState: {
            controller: ReadableStreamDefaultController | null;
            stream: ReadableStream<Uint8Array> | null;
          } = { controller: null, stream: null };
          const streamContext: StreamContext = {
            write: (chunk: string | Uint8Array) => {
              if (!streamState.stream) {
                streamState.stream = new ReadableStream({
                  start(controller) {
                    streamState.controller = controller;
                  },
                });
                this._streamResponse = new Response(streamState.stream, {
                  headers: { "Content-Type": "text/plain" },
                });
              }
              if (streamState.controller) {
                try {
                  streamState.controller.enqueue(
                    typeof chunk === "string" ? SHARED_TEXT_ENCODER.encode(chunk) : chunk,
                  );
                } catch {}
              }
              return streamContext;
            },
            end: (chunk?: string | Uint8Array) => {
              if (chunk != null) {
                streamContext.write(chunk);
              }
              if (streamState.controller) {
                try {
                  streamState.controller.close();
                } catch {}
              }
            },
          };
          this._stream = streamContext;
          return streamContext;
        }

        set stream(value: StreamContext) {
          this._stream = value;
        }

        error(statusCode: number, message?: string): never {
          throw { statusCode, message: message || "Error" };
        }

        finalize(value: any): Response {
          const streamResponse = this._streamResponse;
          const responseData = this._set ? (this._set as any).__responseData : undefined;

          let response: Response;
          if (streamResponse) {
            response =
              responseData?.modified && value instanceof Response
                ? server.applyResponseContext(streamResponse, this._set)
                : streamResponse;
          } else if (value instanceof Response) {
            response = responseData?.modified
              ? server.applyResponseContext(value, this._set)
              : value;
          } else if (!this._set) {
            response = Hedystia.createResponse(value);
          } else if (
            responseData.modified &&
            responseData.statusCode === 200 &&
            responseData.cookies.size === 0
          ) {
            response = Hedystia.createResponse(value, undefined, responseData.responseHeaders);
          } else {
            response = Hedystia.createResponse(value);
            if (responseData.modified) {
              response = server.applyResponseContext(response, this._set);
            }
          }

          if (noSecurity) {
            return response;
          }
          return applySecurityResponse(response, routeSecurity, undefined, undefined);
        }

        errorResponse(err: any): Response {
          if (!this._set) {
            return new Response(
              JSON.stringify({
                message: err?.message || "Internal Server Error",
                code: err?.statusCode || 500,
              }),
              {
                status: err?.statusCode || 500,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          let response = new Response(
            JSON.stringify({
              message: err?.message || "Internal Server Error",
              code: err?.statusCode || 500,
            }),
            {
              status: err?.statusCode || 500,
              headers: { "Content-Type": "application/json" },
            },
          );
          response = server.applyResponseContext(response, this._set);
          if (noSecurity) {
            return response;
          }
          return applySecurityResponse(response, routeSecurity, undefined, undefined);
        }
      }

      return (req: Request, params: Record<string, string>) => {
        const ctx = new SyncContext(req, params);
        let result: any;
        try {
          result = route.handler(ctx);
        } catch (err: any) {
          return ctx.errorResponse(err);
        }

        if (result instanceof Promise || typeof result?.then === "function") {
          return result.then(
            (resolved: any) => ctx.finalize(resolved),
            (err: any) => ctx.errorResponse(err),
          );
        }

        return ctx.finalize(result);
      };
    }

    return async (req: Request, params: Record<string, string>) => {
      let ctx: any;
      const requestId = routeSecurity.requestId
        ? getRequestId(
            req,
            typeof routeSecurity.requestId === "object"
              ? routeSecurity.requestId.header
              : undefined,
          )
        : undefined;
      let rateLimit: { limit: number; count: number; resetAt: number } | undefined;
      try {
        if (hasRequestLimits) {
          assertRequestLimits(req, routeSecurity);
        }
        if (routeSecurity.rateLimit) {
          const result = await consumeRateLimit(req, routeSecurity.rateLimit, this.rateLimitStore);
          rateLimit = { ...result, limit: routeSecurity.rateLimit.limit };
          if (result.count > routeSecurity.rateLimit.limit) {
            throw new RateLimitError(routeSecurity.rateLimit.limit, result.count, result.resetAt);
          }
        }
        const urlStr = req.url;
        let query = parseQuery(urlStr);
        if (routeSecurity.sanitize) {
          query = sanitizeInput(
            query,
            routeSecurity.sanitize === true ? {} : routeSecurity.sanitize,
          );
          params = sanitizeInput(
            params,
            routeSecurity.sanitize === true ? {} : routeSecurity.sanitize,
          );
        }

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

        if (globalParamsSchema) {
          const result = globalParamsSchema["~standard"].validate(params);
          if (result.issues) {
            throw { statusCode: 400, message: "Invalid params" };
          }
          if ("value" in result) {
            params = { ...params, ...result.value };
          }
        }

        if (globalQuerySchema) {
          const result = globalQuerySchema["~standard"].validate(query);
          if (result.issues) {
            throw { statusCode: 400, message: "Invalid query parameters" };
          }
          if ("value" in result) {
            query = { ...query, ...result.value };
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

        let rawHeaders: Record<string, string> | null = null;
        let headers: any;
        if (this.defaultHeaders || headersSchema) {
          rawHeaders = buildRawHeaders(req);
          headers = rawHeaders;
          if (this.defaultHeaders) {
            const globalResult = this.defaultHeaders["~standard"].validate(rawHeaders);
            if (globalResult.issues) {
              throw { statusCode: 400, message: "Invalid header value" };
            }
            if ("value" in globalResult) {
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
        }
        if (routeSecurity.sanitize) {
          const sanitizeOptions = routeSecurity.sanitize === true ? {} : routeSecurity.sanitize;
          rawHeaders ??= buildRawHeaders(req);
          headers = sanitizeInput(rawHeaders, sanitizeOptions);
        }

        let body: any;
        let rawBody: any;

        if (hasBody) {
          try {
            const contentType = (req.headers.get("Content-Type") || "").toLowerCase();
            if (contentType.includes("multipart/form-data")) {
              const rawRequest = routeSecurity.bodyLimit
                ? await limitRequestBody(req, routeSecurity.bodyLimit)
                : req.clone();
              rawBody = await rawRequest.arrayBuffer();
              body = await parseRequestBody(req, routeSecurity.bodyLimit);
            } else if (hooks.onParse.length > 0) {
              const rawRequest = routeSecurity.bodyLimit
                ? await limitRequestBody(req, routeSecurity.bodyLimit)
                : req.clone();
              rawBody = await rawRequest.arrayBuffer();

              const cloned = routeSecurity.bodyLimit
                ? await limitRequestBody(req, routeSecurity.bodyLimit)
                : (req.clone() as unknown as Request);
              let parsed = false;
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

              if (!parsed) {
                body = await parseRequestBody(req, routeSecurity.bodyLimit);
              }
            } else {
              if (routeSecurity.bodyLimit !== undefined) {
                const bytes = await readLimitedBytes(req, routeSecurity.bodyLimit);
                rawBody = bytes;
                body = parseBodyFromText(new TextDecoder().decode(bytes), contentType);
              } else {
                const text = await req.text();
                rawBody = text;
                body = parseBodyFromText(text, contentType);
              }
            }

            if (body === "") {
              body = undefined;
            }
            if (routeSecurity.sanitize && body !== undefined) {
              body = sanitizeInput(
                body,
                routeSecurity.sanitize === true ? {} : routeSecurity.sanitize,
              );
            }

            if (globalBodySchema?.["~standard"]) {
              const globalResult = globalBodySchema["~standard"].validate(body);
              const globalFinal =
                globalResult instanceof Promise ? await globalResult : globalResult;
              if (globalFinal.issues) {
                throw { statusCode: 400, message: "Invalid body" };
              }
              if ("value" in globalFinal) {
                body =
                  globalFinal.value !== null &&
                  typeof globalFinal.value === "object" &&
                  body !== null &&
                  typeof body === "object" &&
                  !Array.isArray(globalFinal.value)
                    ? { ...body, ...globalFinal.value }
                    : globalFinal.value;
              }
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
          } catch (err) {
            if (err instanceof SecurityInputError) {
              throw err;
            }
            if (bodySchema || globalBodySchema) {
              throw { statusCode: 400, message: "Invalid body format" };
            }
          }
        }

        ctx = new FullRequestContext(
          req,
          params,
          query,
          body,
          rawBody,
          route.path,
          route.method,
          this.publish,
          () => this.createResponseContext(),
        );
        ctx.requestId = requestId;
        if (rawHeaders !== null) {
          ctx.initHeaders(rawHeaders, headers);
        }

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
          result = routeSecurity.timeout
            ? await withTimeout(next(), routeSecurity.timeout)
            : await next();
        } else {
          result = routeSecurity.timeout
            ? await withTimeout(runMain(), routeSecurity.timeout)
            : await runMain();
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

        if (ctx.streamResponse) {
          result = ctx.streamResponse;
        } else if (!(result instanceof Response)) {
          result = Hedystia.createResponse(result);
        }

        if (ctx.hasSet) {
          result = this.applyResponseContext(result, ctx.set);
        }

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
        if (ctx.hasSet) {
          result = this.applyResponseContext(result, ctx.set);
        }

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

        return applySecurityResponse(result, routeSecurity, requestId, rateLimit);
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
                  return applySecurityResponse(
                    this.applyResponseContext(
                      errResult,
                      ctx?.set || {
                        status: () => {},
                        headers: {
                          set: () => {},
                          get: () => null,
                          delete: () => {},
                          add: () => {},
                        },
                        cookies: { get: () => undefined, set: () => {}, delete: () => {} },
                      },
                    ),
                    routeSecurity,
                    requestId,
                    rateLimit,
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

        return applySecurityResponse(finalRes, routeSecurity, requestId, rateLimit);
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

  public fetch(req: Request): Response | Promise<Response> {
    this.compile();
    const url = req.url;
    const s = url.indexOf("/", 11);
    const q = url.indexOf("?", s + 1);
    const path = q === -1 ? url.substring(s) : url.substring(s, q);
    const method = req.method;

    if (this.cors && method === "OPTIONS") {
      return this.fetchOptions(req);
    }

    if (method === "POST") {
      const subscriptionId = req.headers.get("x-hedystia-subscription-id");
      if (subscriptionId) {
        return this.fetchSseMessage(req, subscriptionId);
      }
    }

    if (this.staticRoutesFast.size !== 0 && method === "GET") {
      const fastStatic = this.staticRoutesFast.get(path);
      if (fastStatic) {
        return fastStatic(req).then(async (response: Response) => {
          const securityState = await this.prepareGlobalSecurity(req);
          if (securityState.rejection) {
            let rejected = this.applyGlobalSecurity(new Response(null), securityState);
            if (this.cors) {
              rejected = await this.applyCorsHeaders(rejected, req);
            }
            return rejected;
          }
          let finalResponse = this.applyGlobalSecurity(response, securityState);
          if (this.cors) {
            finalResponse = await this.applyCorsHeaders(finalResponse, req);
          }
          return finalResponse;
        });
      }
    }

    const match = this.router.find(method, path);
    if (match) {
      const response = match.handler(req, match.params);
      if (this.cors) {
        return (response instanceof Promise ? response : Promise.resolve(response)).then(
          (settled: Response) => this.applyCorsHeaders(settled, req),
        ) as Promise<Response>;
      }
      return response;
    }

    return this.fetchUnmatched(req, path);
  }

  private async fetchOptions(req: Request): Promise<Response> {
    const securityState = await this.prepareGlobalSecurity(req);
    let response = this.applyGlobalSecurity(new Response(null, { status: 204 }), securityState);
    const corsHeaders = await generateCorsHeaders(this.cors, req);
    response = await this.applyCorsHeaders(response, req);
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, String(value));
    }
    return response;
  }

  private async fetchSseMessage(req: Request, subscriptionId: string): Promise<Response> {
    const conn = this.sseConnections.get(subscriptionId);
    if (conn?.onMessage) {
      try {
        const routeSecurity = this.security;
        const requestId = routeSecurity.requestId
          ? getRequestId(
              req,
              typeof routeSecurity.requestId === "object"
                ? routeSecurity.requestId.header
                : undefined,
            )
          : undefined;
        assertRequestLimits(req, routeSecurity);
        const body = await parseRequestBody(req, routeSecurity.bodyLimit);
        if (routeSecurity.sanitize) {
          conn.onMessage(
            sanitizeInput(body, routeSecurity.sanitize === true ? {} : routeSecurity.sanitize),
          );
        } else {
          conn.onMessage(body);
        }
        const response = applySecurityResponse(
          new Response("OK", { status: 200 }),
          routeSecurity,
          requestId,
        );
        return this.cors ? ((await this.applyCorsHeaders(response, req)) as Response) : response;
      } catch (error: any) {
        const response = applySecurityResponse(
          new Response(error instanceof SecurityInputError ? error.message : "Invalid Body", {
            status: error instanceof SecurityInputError ? error.statusCode : 400,
          }),
          this.security,
        );
        return this.cors ? ((await this.applyCorsHeaders(response, req)) as Response) : response;
      }
    }
    const response = new Response("Subscription not found", { status: 404 });
    return this.cors ? ((await this.applyCorsHeaders(response, req)) as Response) : response;
  }

  private async fetchUnmatched(req: Request, _path: string): Promise<Response> {
    const preparedSecurity = await this.rejectOrPrepareGlobalSecurity(req);
    if (preparedSecurity.state.rejection) {
      let response = this.applyGlobalSecurity(new Response(null), preparedSecurity.state);
      if (this.cors) {
        response = await this.applyCorsHeaders(response, req);
      }
      return response;
    }

    const securityRequest = preparedSecurity.request;
    const securityState = preparedSecurity.state;

    if (this.genericHandlers.length > 0) {
      let response = await processGenericHandlers(securityRequest, this.genericHandlers, 0);
      response = this.applyGlobalSecurity(response, securityState);
      if (this.cors) {
        response = await this.applyCorsHeaders(response, req);
      }
      return response;
    }

    let notFoundResponse = new Response("Not Found", { status: 404 });
    notFoundResponse = this.applyGlobalSecurity(notFoundResponse, securityState);
    if (this.cors) {
      notFoundResponse = await this.applyCorsHeaders(notFoundResponse, req);
    }
    return notFoundResponse;
  }

  private registerSSERoutes(): void {
    for (const [routePath, handlerData] of this.subscriptionHandlers.entries()) {
      const sseHandler = async (req: Request, params: Record<string, string>) => {
        const routeSecurity = mergeSecurityOptions(this.security, handlerData.schema.security);
        const requestId = routeSecurity.requestId
          ? getRequestId(
              req,
              typeof routeSecurity.requestId === "object"
                ? routeSecurity.requestId.header
                : undefined,
            )
          : undefined;
        let rateLimit: { limit: number; count: number; resetAt: number } | undefined;
        try {
          assertRequestLimits(req, routeSecurity);
          if (routeSecurity.rateLimit) {
            const result = await consumeRateLimit(
              req,
              routeSecurity.rateLimit,
              this.rateLimitStore,
            );
            rateLimit = { ...result, limit: routeSecurity.rateLimit.limit };
            if (result.count > routeSecurity.rateLimit.limit) {
              throw new RateLimitError(routeSecurity.rateLimit.limit, result.count, result.resetAt);
            }
          }
        } catch (error: any) {
          return applySecurityResponse(
            new Response(
              JSON.stringify({ message: error.message, code: error.statusCode || 500 }),
              {
                status: error.statusCode || 500,
                headers: { "Content-Type": "application/json" },
              },
            ),
            routeSecurity,
            requestId,
            rateLimit,
          );
        }

        const url = new URL(req.url);
        let query = Object.fromEntries(url.searchParams.entries());
        const rawHeaders: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          rawHeaders[k.toLowerCase()] = v;
        });

        let validatedParams = params || {};
        if (routeSecurity.sanitize) {
          const sanitizeOptions = routeSecurity.sanitize === true ? {} : routeSecurity.sanitize;
          validatedParams = sanitizeInput(validatedParams, sanitizeOptions);
          query = sanitizeInput(query, sanitizeOptions);
        }
        if (this.globals.params) {
          const globalResult = this.globals.params["~standard"].validate(params || {}) as any;
          if ("issues" in globalResult) {
            return new Response(JSON.stringify({ error: "Invalid params" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          if ("value" in globalResult) {
            validatedParams = { ...validatedParams, ...globalResult.value };
          }
        }
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
        if (this.globals.query) {
          const globalResult = this.globals.query["~standard"].validate(query || {}) as any;
          if ("issues" in globalResult) {
            return new Response(JSON.stringify({ error: "Invalid query" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          if ("value" in globalResult) {
            validatedQuery = { ...validatedQuery, ...globalResult.value };
          }
        }
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
          if ("issues" in globalResult) {
            return new Response(JSON.stringify({ error: "Invalid headers" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          if ("value" in globalResult) {
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
                requestId,
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

        return applySecurityResponse(
          new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          }),
          routeSecurity,
          requestId,
          rateLimit,
        );
      };

      this.router.add("GET", routePath, sseHandler);
    }
  }

  private canPromoteStaticRoutes(): boolean {
    return (
      !this.cors &&
      !this.sseMode &&
      this.onRequestHandlers.length === 0 &&
      this.onParseHandlers.length === 0 &&
      this.onTransformHandlers.length === 0 &&
      this.onBeforeHandleHandlers.length === 0 &&
      this.onAfterHandleHandlers.length === 0 &&
      this.onMapResponseHandlers.length === 0 &&
      this.onAfterResponseHandlers.length === 0 &&
      this.onErrorHandlers.length === 0 &&
      !this.defaultHeaders &&
      !this.globals.params &&
      !this.globals.query &&
      !this.globals.body &&
      this.wsRoutes.size === 0 &&
      this.subscriptionHandlers.size === 0 &&
      this.genericHandlers.length === 0 &&
      !this.security.bodyLimit &&
      !this.security.maxQueryParameters &&
      !this.security.maxQueryDepth &&
      !this.security.sanitize &&
      !this.security.rateLimit &&
      !this.security.requestId &&
      !this.security.headers
    );
  }

  private collectNativeRoutes(): Record<string, Record<string, Response>> | undefined {
    if (!this.canPromoteStaticRoutes()) {
      return undefined;
    }

    const promotableMethods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);
    let routes: Record<string, Record<string, Response>> | undefined;

    for (const route of this.routes) {
      if (!promotableMethods.has(route.method) || route.value === undefined) {
        continue;
      }
      if (
        route.schema.security ||
        Object.keys(route.schema).some((key) => (route.schema as any)[key] === true)
      ) {
        continue;
      }

      let response: Response;
      if (route.value instanceof Response) {
        response = route.value;
      } else {
        if (route.value instanceof ReadableStream) {
          continue;
        }
        response = Hedystia.createResponse(route.value);
      }

      if (routes === undefined) {
        routes = {};
      }
      let byPath = routes[route.path];
      if (!byPath) {
        byPath = routes[route.path] = {};
      }
      byPath[route.method] = response;
    }

    for (const staticRoute of this.staticRoutes) {
      if (routes === undefined) {
        routes = {};
      }
      let byPath = routes[staticRoute.path];
      if (!byPath) {
        byPath = routes[staticRoute.path] = {};
      }
      byPath.GET ??= staticRoute.response;
    }

    return routes;
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

    const nativeRoutes = this.collectNativeRoutes();

    if (this.sseMode) {
      this.registerSSERoutes();
      this.server = serveUnified({
        port,
        reusePort: this.reusePort,
        idleTimeout: this.idleTimeout,
        fetch: (req) => this.fetch(req),
        routes: nativeRoutes,
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
        routes: nativeRoutes,
      }) as unknown as UnifiedServer;
      this.startHeartbeat();
    } else {
      this.server = serveUnified({
        port,
        reusePort: this.reusePort,
        idleTimeout: this.idleTimeout,
        fetch: (req) => this.fetch(req),
        directFetch: this.fetch.bind(this),
        routes: nativeRoutes,
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
          if (this.globals.params) {
            const globalResult = this.globals.params["~standard"].validate(
              rawParams || {},
            ) as StandardSchemaV1.Result<any>;
            if ("issues" in globalResult) {
              console.error("Validation error (params):", globalResult.issues);
              return;
            }
            if ("value" in globalResult) {
              validatedParams = { ...validatedParams, ...globalResult.value };
            }
          }
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
          if (this.globals.query && query) {
            const globalResult = this.globals.query["~standard"].validate(
              query,
            ) as StandardSchemaV1.Result<any>;
            if ("issues" in globalResult) {
              console.error("Validation error (query):", globalResult.issues);
              return;
            }
            if ("value" in globalResult) {
              validatedQuery = { ...validatedQuery, ...globalResult.value };
            }
          }
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
            if ("issues" in globalResult) {
              console.error("Validation error (headers):", globalResult.issues);
              ws.send(
                JSON.stringify({
                  path: topic,
                  error: { message: "Validation error", issues: globalResult.issues },
                  subscriptionId: subscriptionId,
                }),
              );
              return;
            }
            if ("value" in globalResult) {
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
      responseHeaders: Object.create(null) as Record<string, string>,
      cookies: new Map<string, { value: string; options?: CookieOptions }>(),
      modified: false,
    };

    const headerKey = (key: string) => key.toLowerCase();

    const headersAPI = {
      set: (key: string, value: string) => {
        responseData.responseHeaders[headerKey(key)] = value;
        responseData.modified = true;
        return context;
      },
      get: (key: string) => responseData.responseHeaders[headerKey(key)] ?? null,
      delete: (key: string) => {
        delete responseData.responseHeaders[headerKey(key)];
        responseData.modified = true;
        return context;
      },
      add: (key: string, value: string) => {
        const normalizedKey = headerKey(key);
        const existing = responseData.responseHeaders[normalizedKey];
        if (existing) {
          responseData.responseHeaders[normalizedKey] = `${existing}, ${value}`;
        } else {
          responseData.responseHeaders[normalizedKey] = value;
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

  private async prepareGlobalSecurity(req: Request): Promise<SecurityRequestState> {
    const security = this.security;
    if (
      !security.bodyLimit &&
      !security.maxQueryParameters &&
      !security.maxQueryDepth &&
      !security.rateLimit &&
      !security.requestId
    ) {
      return EMPTY_SECURITY_STATE;
    }

    let requestId: string | undefined;
    let rateLimit: { limit: number; count: number; resetAt: number } | undefined;

    try {
      assertRequestLimits(req, this.security);
      if (this.security.requestId) {
        requestId = getRequestId(
          req,
          typeof this.security.requestId === "object" ? this.security.requestId.header : undefined,
        );
      }
      if (this.security.rateLimit) {
        const result = await consumeRateLimit(req, this.security.rateLimit, this.rateLimitStore);
        rateLimit = { ...result, limit: this.security.rateLimit.limit };
        if (result.count > this.security.rateLimit.limit) {
          return {
            requestId,
            rateLimit,
            rejection: new Response(JSON.stringify({ message: "Too Many Requests", code: 429 }), {
              status: 429,
              headers: { "Content-Type": "application/json" },
            }),
          };
        }
      }
      return { requestId, rateLimit };
    } catch (error: any) {
      return {
        requestId,
        rateLimit,
        rejection: new Response(
          JSON.stringify({ message: error.message, code: error.statusCode || 500 }),
          {
            status: error.statusCode || 500,
            headers: { "Content-Type": "application/json" },
          },
        ),
      };
    }
  }

  private applyGlobalSecurity(response: Response, state: SecurityRequestState): Response {
    return applySecurityResponse(
      state.rejection || response,
      this.security,
      state.requestId,
      state.rateLimit,
    );
  }

  private async rejectOrPrepareGlobalSecurity(
    req: Request,
  ): Promise<{ state: SecurityRequestState; request: Request }> {
    const state = await this.prepareGlobalSecurity(req);
    if (state.rejection || this.security.bodyLimit === undefined) {
      return { state, request: req };
    }
    try {
      return { state, request: await limitRequestBody(req, this.security.bodyLimit) };
    } catch (error: any) {
      return {
        state: {
          ...state,
          rejection: new Response(
            JSON.stringify({ message: error.message, code: error.statusCode || 500 }),
            {
              status: error.statusCode || 500,
              headers: { "Content-Type": "application/json" },
            },
          ),
        },
        request: req,
      };
    }
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

    for (const key in responseData.responseHeaders) {
      if (Object.hasOwn(responseData.responseHeaders, key)) {
        newHeaders.set(key, responseData.responseHeaders[key]);
      }
    }

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
    for (const key in responseData.responseHeaders) {
      delete responseData.responseHeaders[key];
    }
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
