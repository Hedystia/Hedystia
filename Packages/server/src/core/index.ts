import createWrappedHandler from "../handlers/wrapped";
import { Hedystia } from "../server";
import type {
  ContextTypes,
  CorsOptions,
  ExtractSubscriptionRoutes,
  GenericRequestHandler,
  InferOutput,
  InferRouteContext,
  MacroData,
  MacroResolveFunction,
  MergeMacros,
  PrefixRoutes,
  PublishMethod,
  PublishOptions,
  PublishTree,
  RequestHandler,
  RouteDefinition,
  RouteSchema,
  SubscriptionContext,
  SubscriptionHandler,
  SubscriptionLifecycleContext,
  SubscriptionMessageContext,
  ValidationSchema,
  WebSocketHandler,
  WebSocketOptions,
} from "../types";
import type { TestContext } from "../types/routes";
import { determineContentType, isBunHTMLBundle } from "../utils";

type NextFunction = () => Promise<Response>;

type OnRequestHandler = (req: Request) => Request | Promise<Request>;
type OnParseHandler = (req: Request) => Promise<any> | any;
type OnTransformHandler<T extends RouteSchema = {}> = (ctx: ContextTypes<T>) => any | Promise<any>;
type OnBeforeHandleHandler<T extends RouteSchema = {}> = (
  ctx: ContextTypes<T>,
  next: NextFunction,
) => Response | Promise<Response> | void | Promise<void>;
type OnAfterHandleHandler<T extends RouteSchema = {}> = (
  response: Response,
  ctx: ContextTypes<T>,
) => any | Promise<any>;
type OnMapResponseHandler<T extends RouteSchema = {}> = (
  result: ContextTypes<T>,
  ctx: ContextTypes<T>,
) => any | Promise<any>;
type OnErrorHandler<T extends RouteSchema = {}> = (
  error: Error,
  ctx: ContextTypes<T>,
) => any | Promise<any>;
type OnAfterResponseHandler<T extends RouteSchema = {}> = (
  response: Response,
  ctx: ContextTypes<T>,
) => void | Promise<void>;

type OnSubscriptionOpenHandler = (ctx: SubscriptionLifecycleContext) => void | Promise<void>;
type OnSubscriptionCloseHandler = (ctx: SubscriptionLifecycleContext) => void | Promise<void>;
type OnSubscriptionMessageHandler<Routes extends RouteDefinition[] = []> = (
  ctx: SubscriptionMessageContext<Routes>,
) => void | Promise<void>;

export default class Core<
  Routes extends RouteDefinition[] = [],
  Macros extends MacroData = {},
  GlobalHeaders extends ValidationSchema | undefined = undefined,
> {
  protected sseMode = false;
  protected sseConnections: Map<
    string,
    {
      controller: ReadableStreamDefaultController;
      subscriptionId: string;
      path: string;
      onMessage?: (message: any) => void;
    }
  > = new Map();
  protected onRequestHandlers: OnRequestHandler[] = [];
  protected onParseHandlers: OnParseHandler[] = [];
  protected onTransformHandlers: OnTransformHandler[] = [];
  protected onBeforeHandleHandlers: OnBeforeHandleHandler[] = [];
  protected onAfterHandleHandlers: OnAfterHandleHandler[] = [];
  protected onMapResponseHandlers: OnMapResponseHandler[] = [];
  protected onErrorHandlers: OnErrorHandler[] = [];
  protected onAfterResponseHandlers: OnAfterResponseHandler[] = [];
  protected onSubscriptionOpenHandlers: OnSubscriptionOpenHandler[] = [];
  protected onSubscriptionCloseHandlers: OnSubscriptionCloseHandler[] = [];
  protected onSubscriptionMessageHandlers: OnSubscriptionMessageHandler<any>[] = [];
  public staticRoutesMap: Map<string, Response> = new Map();

  /**
   * Register a handler for the 'request' lifecycle event
   * @param {OnRequestHandler} handler - Function to handle request event
   * @returns {this} Current instance
   */
  onRequest(handler: OnRequestHandler): this {
    this.onRequestHandlers.push(handler);
    return this;
  }

  /**
   * Register a handler for the 'parse' lifecycle event
   * @param {OnParseHandler} handler - Function to handle parse event
   * @returns {this} Current instance
   */
  onParse(handler: OnParseHandler): this {
    this.onParseHandlers.push(handler);
    return this;
  }

  /**
   * Register a handler for the 'transform' lifecycle event
   * @param {OnTransformHandler<T>} handler - Function to handle transform event
   * @returns {this} Current instance
   */
  onTransform<T extends RouteSchema = {}>(handler: OnTransformHandler<T>): this {
    this.onTransformHandlers.push(handler as OnTransformHandler);
    return this;
  }

  /**
   * Register a handler for the 'beforeHandle' lifecycle event
   * @param {OnBeforeHandleHandler<T>} handler - Function to handle beforeHandle event
   * @returns {this} Current instance
   */
  onBeforeHandle<T extends RouteSchema = {}>(handler: OnBeforeHandleHandler<T>): this {
    this.onBeforeHandleHandlers.push(handler as OnBeforeHandleHandler);
    return this;
  }

  /**
   * Register a handler for the 'afterHandle' lifecycle event
   * @param {OnAfterHandleHandler<T>} handler - Function to handle afterHandle event
   * @returns {this} Current instance
   */
  onAfterHandle<T extends RouteSchema = {}>(handler: OnAfterHandleHandler<T>): this {
    this.onAfterHandleHandlers.push(handler as OnAfterHandleHandler);
    return this;
  }

  /**
   * Register a handler for the 'mapResponse' lifecycle event
   * @param {OnMapResponseHandler<T>} handler - Function to handle mapResponse event
   * @returns {this} Current instance
   */
  onMapResponse<T extends RouteSchema = {}>(handler: OnMapResponseHandler<T>): this {
    this.onMapResponseHandlers.push(handler as OnMapResponseHandler);
    return this;
  }

  /**
   * Register a handler for the 'error' lifecycle event
   * @param {OnErrorHandler<T>} handler - Function to handle error event
   * @returns {this} Current instance
   */
  onError<T extends RouteSchema = {}>(handler: OnErrorHandler<T>): this {
    this.onErrorHandlers.push(handler as OnErrorHandler);
    return this;
  }

  /**
   * Register a handler for the 'afterResponse' lifecycle event
   * @param {OnAfterResponseHandler<T>} handler - Function to handle afterResponse event
   * @returns {this} Current instance
   */
  onAfterResponse<T extends RouteSchema = {}>(handler: OnAfterResponseHandler<T>): this {
    this.onAfterResponseHandlers.push(handler as OnAfterResponseHandler);
    return this;
  }

  /**
   * Register a handler for the 'subscriptionOpen' lifecycle event
   * Called when a client subscribes to a topic
   * @param {OnSubscriptionOpenHandler} handler - Function to handle subscriptionOpen event
   * @returns {this} Current instance
   */
  onSubscriptionOpen(handler: OnSubscriptionOpenHandler): this {
    this.onSubscriptionOpenHandlers.push(handler);
    return this;
  }

  /**
   * Register a handler for the 'subscriptionClose' lifecycle event
   * Called when a subscription ends (disconnect, unsubscribe, timeout, or error)
   * @param {OnSubscriptionCloseHandler} handler - Function to handle subscriptionClose event
   * @returns {this} Current instance
   */
  onSubscriptionClose(handler: OnSubscriptionCloseHandler): this {
    this.onSubscriptionCloseHandlers.push(handler);
    return this;
  }

  /**
   * Register a handler for the 'subscriptionMessage' lifecycle event
   * Called when a message is received from a client in a subscription
   * @param {OnSubscriptionMessageHandler} handler - Function to handle subscriptionMessage event
   * @returns {this} Current instance
   */
  onSubscriptionMessage(handler: OnSubscriptionMessageHandler<Routes>): this {
    this.onSubscriptionMessageHandlers.push(handler);
    return this;
  }

  public macros: Record<string, { resolve: MacroResolveFunction<any> }> = {};

  /**
   * Register a macro configuration to extend request context
   * @param {T} config - Macro configuration object
   * @returns {Hedystia<Routes, Macros & { [K in keyof T]: ReturnType<ReturnType<T[K]>["resolve"]> }>} Instance with extended macros
   */
  macro<T extends Record<string, (enabled: boolean) => { resolve: MacroResolveFunction<any> }>>(
    config: T,
  ): Hedystia<
    Routes,
    Macros & { [K in keyof T]: ReturnType<ReturnType<T[K]>["resolve"]> },
    GlobalHeaders
  > {
    for (const [key, macroFactory] of Object.entries(config)) {
      this.macros[key] = macroFactory(true);
    }

    return this as any;
  }

  public routes: {
    method: "GET" | "PATCH" | "POST" | "PUT" | "DELETE";
    path: string;
    schema: RouteSchema;
    handler: RequestHandler;
    test?: (context: TestContext<any, any, any, any, any>) => Promise<void> | void;
  }[] = [];
  public cors: CorsOptions | undefined = undefined;
  public prefix = "";

  /**
   * Group routes with a common prefix and optional macro configuration
   * @param {Prefix} prefix - Path prefix for the group
   * @param {(app: Hedystia<[], Macros>)} callback - Function defining group routes
   * @param {Object} schema - Optional macro configuration to apply to all routes in the group
   * @returns {Hedystia<[...Routes, ...PrefixRoutes<Prefix, GroupRoutes>], Macros>} Instance with grouped routes
   */
  group<
    Prefix extends string,
    GroupRoutes extends RouteDefinition[],
    EnabledMacros extends keyof Macros = never,
  >(
    prefix: Prefix,
    callback: (
      app: Hedystia<[], Macros, GlobalHeaders>,
    ) => Hedystia<GroupRoutes, Macros, GlobalHeaders>,
    schema?: { [K in EnabledMacros]?: true },
  ): Hedystia<[...Routes, ...PrefixRoutes<Prefix, GroupRoutes>], Macros, GlobalHeaders> {
    const groupApp = new Hedystia({ cors: this.cors }) as Hedystia<[], Macros>;
    groupApp.prefix = "";
    groupApp.macros = { ...this.macros };

    const hasMacros = schema && Object.keys(schema).some((key) => (schema as any)[key] === true);

    if (hasMacros && schema) {
      const enabledMacros = Object.keys(schema).filter((key) => (schema as any)[key] === true);

      const wrapMethod = (originalMethod: any) => {
        return function (this: any, path: string, handler: any, routeSchema: any = {}) {
          const mergedSchema = { ...routeSchema };
          for (const macroKey of enabledMacros) {
            if (!mergedSchema[macroKey]) {
              mergedSchema[macroKey] = true;
            }
          }
          return originalMethod.call(this, path, handler, mergedSchema);
        };
      };

      groupApp.get = wrapMethod(groupApp.get.bind(groupApp)) as any;
      groupApp.post = wrapMethod(groupApp.post.bind(groupApp)) as any;
      groupApp.put = wrapMethod(groupApp.put.bind(groupApp)) as any;
      groupApp.patch = wrapMethod(groupApp.patch.bind(groupApp)) as any;
      groupApp.delete = wrapMethod(groupApp.delete.bind(groupApp)) as any;
      groupApp.subscription = wrapMethod(groupApp.subscription.bind(groupApp)) as any;
    }

    const configuredApp = callback(groupApp);
    const fullPrefix = this.prefix + prefix;

    for (let i = 0; i < configuredApp.routes.length; i++) {
      const route = configuredApp.routes[i];
      if (route) {
        const newPath = route.path === "/" ? fullPrefix : fullPrefix + route.path;
        this.routes.push({
          ...route,
          path: newPath,
        });
      }
    }

    for (const staticRoute of configuredApp.staticRoutes) {
      if (staticRoute.path === "/" && prefix !== "") {
        this.staticRoutes.push({
          path: fullPrefix,
          response: staticRoute.response,
        });
      } else {
        this.staticRoutes.push({
          path: fullPrefix + staticRoute.path,
          response: staticRoute.response,
        });
      }
    }

    for (const [path, handlerData] of configuredApp.subscriptionHandlers.entries()) {
      const finalPath = fullPrefix === "/" ? path : fullPrefix + path;
      this.subscriptionHandlers.set(finalPath, handlerData);
    }

    this.onRequestHandlers.push(...configuredApp.onRequestHandlers);
    this.onParseHandlers.push(...configuredApp.onParseHandlers);
    this.onTransformHandlers.push(...configuredApp.onTransformHandlers);
    this.onBeforeHandleHandlers.push(...configuredApp.onBeforeHandleHandlers);
    this.onAfterHandleHandlers.push(...configuredApp.onAfterHandleHandlers);
    this.onMapResponseHandlers.push(...configuredApp.onMapResponseHandlers);
    this.onErrorHandlers.push(...configuredApp.onErrorHandlers);
    this.onAfterResponseHandlers.push(...configuredApp.onAfterResponseHandlers);

    return this as any;
  }

  public subscriptionHandlers: Map<string, { handler: SubscriptionHandler; schema: RouteSchema }> =
    new Map();
  public server: any = null;

  /**
   * Register a subscription handler for a WebSocket topic with optional macro support
   * @param {Path} path - The subscription topic path, can include parameters like /users/:id
   * @param {Handler} handler - Function to handle the subscription. Can return initial data.
   * @param {Object} schema - Validation schemas for params, query, headers, data, and error. Can also enable macros.
   * @returns {Hedystia<[...Routes, {...}], Macros>} Instance with registered subscription
   */
  subscription<
    Path extends string,
    Params extends ValidationSchema,
    Query extends ValidationSchema,
    Headers extends ValidationSchema,
    DataSchema extends ValidationSchema,
    ErrorSchema extends ValidationSchema,
    MessageSchema extends ValidationSchema,
    EnabledMacros extends keyof Macros = never,
    Handler extends (
      ctx: SubscriptionContext<
        {
          params: Params;
          query: Query;
          headers: Headers;
          data: DataSchema;
          error: ErrorSchema;
          message: MessageSchema;
        },
        Macros,
        EnabledMacros
      >,
    ) => any = (
      ctx: SubscriptionContext<
        {
          params: Params;
          query: Query;
          headers: Headers;
          data: DataSchema;
          error: ErrorSchema;
          message: MessageSchema;
        },
        Macros,
        EnabledMacros
      >,
    ) => any,
  >(
    path: Path,
    handler: Handler,
    schema: {
      params?: Params;
      query?: Query;
      headers?: Headers;
      data?: DataSchema;
      error?: ErrorSchema;
      message?: MessageSchema;
      description?: string;
      summary?: string;
      tags?: string[];
    } & { [K in EnabledMacros]?: true } = {} as any,
  ): Hedystia<
    [
      ...Routes,
      {
        method: "SUB";
        path: Path;
        params: Params extends ValidationSchema ? InferOutput<Params> : {};
        query: Query extends ValidationSchema ? InferOutput<Query> : {};
        headers: (Headers extends ValidationSchema ? InferOutput<Headers> : {}) &
          (GlobalHeaders extends ValidationSchema ? InferOutput<GlobalHeaders> : {});
        data: DataSchema extends ValidationSchema ? InferOutput<DataSchema> : any;
        error: ErrorSchema extends ValidationSchema ? InferOutput<ErrorSchema> : undefined;
        message: MessageSchema extends ValidationSchema ? InferOutput<MessageSchema> : any;
      },
    ],
    Macros,
    GlobalHeaders
  > {
    const fullPath = this.prefix + path;

    const hasMacros = Object.keys(schema).some(
      (key) =>
        ![
          "params",
          "query",
          "headers",
          "data",
          "error",
          "message",
          "description",
          "summary",
          "tags",
        ].includes(key) && (schema as any)[key] === true,
    );

    const finalHandler = hasMacros
      ? async (ctx: any) => {
          for (const key of Object.keys(schema)) {
            if (
              ![
                "params",
                "query",
                "headers",
                "data",
                "error",
                "message",
                "description",
                "summary",
                "tags",
              ].includes(key) &&
              (schema as any)[key] === true &&
              this.macros[key]
            ) {
              try {
                const macroResult = this.macros[key].resolve(ctx);
                ctx[key] = macroResult instanceof Promise ? await macroResult : macroResult;
              } catch (err: any) {
                if (err.isMacroError) {
                  ctx.sendError({ message: err.message, code: err.statusCode });
                  return;
                }
                throw err;
              }
            }
          }
          return handler(ctx);
        }
      : handler;

    this.subscriptionHandlers.set(fullPath, {
      handler: finalHandler as SubscriptionHandler,
      schema: {
        params: schema.params,
        query: schema.query,
        headers: schema.headers,
        data: schema.data,
        error: schema.error,
        message: schema.message,
        description: schema.description || schema.summary,
        tags: schema.tags,
      },
    });

    return this as any;
  }

  /**
   * Publish a message to a WebSocket topic.
   * @param {string} topic - The topic to publish to.
   * @param {any} [options.data] - The data to send
   * @param {any} [options.error] - The error to send
   * @param {boolean} [options.compress] - Whether to compress the message.
   * @returns {void}
   */
  publish: PublishMethod<Routes> = <T extends ExtractSubscriptionRoutes<Routes>>(
    topic: T["path"],
    options: T extends { data: infer D; error: infer E }
      ? PublishOptions<D, E> & ({ data: D; error?: never } | { data?: never; error: E })
      : PublishOptions,
  ): void => {
    const messagePayload = {
      path: topic,
      ...(options && typeof options === "object" && ("data" in options || "error" in options)
        ? options
        : { data: options }),
    };

    let matchedSchema: RouteSchema | undefined;

    for (const [routePath, handlerData] of this.subscriptionHandlers) {
      if (this.matchPath(routePath, topic)) {
        matchedSchema = handlerData.schema;
        break;
      }
    }

    if (matchedSchema) {
      if ("data" in messagePayload && matchedSchema.data) {
        const result = matchedSchema.data["~standard"].validate(messagePayload.data);
        if (result instanceof Promise) {
          result.then((res: any) => {
            if ("issues" in res) {
              console.error(
                `[Publish Validation Error] Data for topic ${topic} is invalid:`,
                res.issues,
              );
            }
          });
        } else {
          if ("issues" in result) {
            console.error(
              `[Publish Validation Error] Data for topic ${topic} is invalid:`,
              result.issues,
            );
          }
        }
      }
      if ("error" in messagePayload && matchedSchema.error) {
        const result = matchedSchema.error["~standard"].validate(messagePayload.error);
        if (result instanceof Promise) {
          result.then((res: any) => {
            if ("issues" in res) {
              console.error(
                `[Publish Validation Error] Error for topic ${topic} is invalid:`,
                res.issues,
              );
            }
          });
        } else {
          if ("issues" in result) {
            console.error(
              `[Publish Validation Error] Error for topic ${topic} is invalid:`,
              result.issues,
            );
          }
        }
      }
    }

    if (this.sseMode) {
      for (const [, conn] of this.sseConnections) {
        if (this.matchPath(conn.path, topic)) {
          try {
            const msg = `data: ${JSON.stringify(messagePayload)}\n\n`;
            conn.controller.enqueue(new TextEncoder().encode(msg));
          } catch {}
        }
      }
      return;
    }

    if (this.server) {
      const message = JSON.stringify(messagePayload);
      this.server.publish(topic, message, options.compress);
    } else {
      console.warn("Server is not running. Cannot publish message.");
    }
  };

  protected matchPath(pattern: string, path: string): boolean {
    let pi = pattern.charCodeAt(0) === 47 ? 1 : 0;
    let qi = path.charCodeAt(0) === 47 ? 1 : 0;

    while (pi < pattern.length && qi < path.length) {
      const pEnd = pattern.indexOf("/", pi);
      const qEnd = path.indexOf("/", qi);
      const pSeg = pattern.slice(pi, pEnd === -1 ? pattern.length : pEnd);
      const qSeg = path.slice(qi, qEnd === -1 ? path.length : qEnd);

      if (pSeg.charCodeAt(0) !== 58 && pSeg !== qSeg) {
        return false;
      }

      pi = pEnd === -1 ? pattern.length : pEnd + 1;
      qi = qEnd === -1 ? path.length : qEnd + 1;
    }

    return pi >= pattern.length && qi >= path.length;
  }

  /**
   * Tree-based publish API for WebSocket subscriptions.
   * Usage: app.pub.data.messages({ data: { ... } })
   */
  get pub(): PublishTree<Routes> {
    const self = this;
    const createProxy = (pathParts: string[] = []): any => {
      return new Proxy(() => {}, {
        get(_target, prop: string) {
          return createProxy([...pathParts, prop]);
        },
        apply(_target, _thisArg, args) {
          const path = `/${pathParts.join("/")}`;
          self.publish(path as any, args[0]);
        },
      });
    };
    return createProxy() as PublishTree<Routes>;
  }

  public staticRoutes: { path: string; response: Response }[] = [];

  private addRoute(method: any, path: any, handler: any, schema: any) {
    const fullPath = this.prefix + path;

    const hasMacros = Object.keys(schema).some(
      (key) =>
        !["params", "query", "body", "headers", "response", "description", "tags", "test"].includes(
          key,
        ) && schema[key as keyof typeof schema] === true,
    );

    const actualHandler = typeof handler === "function" ? handler : () => handler;
    const finalHandler = hasMacros
      ? createWrappedHandler(actualHandler, schema, this.macros)
      : actualHandler;

    this.routes.push({
      method,
      path: fullPath,
      handler: finalHandler,
      schema: {
        params: schema.params || ({} as any),
        query: schema.query || ({} as any),
        headers: schema.headers || ({} as any),
        body: schema.body,
        response: schema.response,
        description: schema.description,
        tags: schema.tags,
      },
      test: schema.test,
    });
  }

  /**
   * Register a GET route handler
   * @param {Path} path - Route path
   * @param {(ctx: InferRouteContext)} handler - Request handler function
   * @param {Object} schema - Validation schemas configuration
   * @param {Params} [schema.params] - Path parameters schema
   * @param {Query} [schema.query] - Query parameters schema
   * @param {Headers} [schema.headers] - Headers schema
   * @param {ResponseSchema} [schema.response] - Response schema
   * @param {string} [schema.description] - Route description
   * @param {string[]} [schema.tags] - Route tags
   * @returns {Hedystia<[...Routes, ...], Macros>} Instance with new route
   */
  get<
    Path extends string,
    Params extends ValidationSchema,
    Query extends ValidationSchema,
    Headers extends ValidationSchema,
    ResponseSchema extends ValidationSchema,
    ErrorSchema extends ValidationSchema,
    EnabledMacros extends keyof Macros = never,
  >(
    path: Path,
    handler: (
      ctx: InferRouteContext<
        { params: Params; query: Query; headers: Headers },
        Macros,
        EnabledMacros
      >,
    ) => Response | any | Promise<Response | any>,
    schema: {
      params?: Params;
      query?: Query;
      headers?: Headers;
      response?: ResponseSchema;
      error?: ErrorSchema;
      description?: string;
      tags?: string[];
      test?: (
        context: TestContext<Params, Query, undefined, Headers, ResponseSchema>,
      ) => Promise<void> | void;
    } & { [K in EnabledMacros]?: true } = {} as any,
  ): Hedystia<
    [
      ...Routes,
      {
        method: "GET";
        path: Path;
        params: Params extends ValidationSchema ? InferOutput<Params> : {};
        query: Query extends ValidationSchema ? InferOutput<Query> : {};
        headers: (Headers extends ValidationSchema
          ? InferOutput<Headers>
          : Record<string, string | null>) &
          (GlobalHeaders extends ValidationSchema ? InferOutput<GlobalHeaders> : {});
        response: ResponseSchema extends ValidationSchema ? InferOutput<ResponseSchema> : unknown;
        error: ErrorSchema extends ValidationSchema ? InferOutput<ErrorSchema> : undefined;
      },
    ],
    Macros,
    GlobalHeaders
  > {
    this.addRoute("GET", path, handler, schema);
    return this as any;
  }

  /**
   * Register a PATCH route handler
   * @param {Path} path - Route path
   * @param {(ctx: InferRouteContext)} handler - Request handler function
   * @param {Object} schema - Validation schemas configuration
   * @param {Params} [schema.params] - Path parameters schema
   * @param {Query} [schema.query] - Query parameters schema
   * @param {Body} [schema.body] - Body schema
   * @param {Headers} [schema.headers] - Headers schema
   * @param {ResponseSchema} [schema.response] - Response schema
   * @param {string} [schema.description] - Route description
   * @param {string[]} [schema.tags] - Route tags
   * @returns {Hedystia<[...Routes, ...], Macros>} Instance with new route
   */
  patch<
    Path extends string,
    Params extends ValidationSchema,
    Query extends ValidationSchema,
    Body extends ValidationSchema,
    Headers extends ValidationSchema,
    ResponseSchema extends ValidationSchema,
    EnabledMacros extends keyof Macros = never,
  >(
    path: Path,
    handler: (
      ctx: InferRouteContext<
        { params: Params; query: Query; body: Body; headers: Headers },
        Macros,
        EnabledMacros
      >,
    ) => Response | any | Promise<Response | any>,
    schema: {
      params?: Params;
      query?: Query;
      body?: Body;
      headers?: Headers;
      response?: ResponseSchema;
      description?: string;
      tags?: string[];
      test?: (
        context: TestContext<Params, Query, Body, Headers, ResponseSchema>,
      ) => Promise<void> | void;
    } & { [K in EnabledMacros]?: true } = {} as any,
  ): Hedystia<
    [
      ...Routes,
      {
        method: "PATCH";
        path: Path;
        params: Params extends ValidationSchema ? InferOutput<Params> : {};
        query: Query extends ValidationSchema ? InferOutput<Query> : {};
        body: Body extends ValidationSchema ? InferOutput<Body> : unknown;
        headers: (Headers extends ValidationSchema
          ? InferOutput<Headers>
          : Record<string, string | null>) &
          (GlobalHeaders extends ValidationSchema ? InferOutput<GlobalHeaders> : {});
        response: ResponseSchema extends ValidationSchema ? InferOutput<ResponseSchema> : unknown;
      },
    ],
    Macros,
    GlobalHeaders
  > {
    this.addRoute("PATCH", path, handler, schema);
    return this as any;
  }

  /**
   * Register a POST route handler
   * @param {Path} path - Route path
   * @param {(ctx: InferRouteContext)} handler - Request handler function
   * @param {Object} schema - Validation schemas configuration
   * @param {Params} [schema.params] - Path parameters schema
   * @param {Query} [schema.query] - Query parameters schema
   * @param {Body} [schema.body] - Body schema
   * @param {Headers} [schema.headers] - Headers schema
   * @param {ResponseSchema} [schema.response] - Response schema
   * @param {string} [schema.description] - Route description
   * @param {string[]} [schema.tags] - Route tags
   * @returns {Hedystia<[...Routes, ...], Macros>} Instance with new route
   */
  post<
    Path extends string,
    Params extends ValidationSchema,
    Query extends ValidationSchema,
    Body extends ValidationSchema,
    Headers extends ValidationSchema,
    ResponseSchema extends ValidationSchema,
    EnabledMacros extends keyof Macros = never,
  >(
    path: Path,
    handler: (
      ctx: InferRouteContext<
        { params: Params; query: Query; body: Body; headers: Headers },
        Macros,
        EnabledMacros
      >,
    ) => Response | any | Promise<Response | any>,
    schema: {
      params?: Params;
      query?: Query;
      body?: Body;
      headers?: Headers;
      response?: ResponseSchema;
      description?: string;
      tags?: string[];
      test?: (
        context: TestContext<Params, Query, Body, Headers, ResponseSchema>,
      ) => Promise<void> | void;
    } & { [K in EnabledMacros]?: true } = {} as any,
  ): Hedystia<
    [
      ...Routes,
      {
        method: "POST";
        path: Path;
        params: Params extends ValidationSchema ? InferOutput<Params> : {};
        query: Query extends ValidationSchema ? InferOutput<Query> : {};
        body: Body extends ValidationSchema ? InferOutput<Body> : unknown;
        headers: (Headers extends ValidationSchema
          ? InferOutput<Headers>
          : Record<string, string | null>) &
          (GlobalHeaders extends ValidationSchema ? InferOutput<GlobalHeaders> : {});
        response: ResponseSchema extends ValidationSchema ? InferOutput<ResponseSchema> : unknown;
      },
    ],
    Macros,
    GlobalHeaders
  > {
    this.addRoute("POST", path, handler, schema);
    return this as any;
  }

  /**
   * Register a PUT route handler
   * @param {Path} path - Route path
   * @param {(ctx: InferRouteContext)} handler - Request handler function
   * @param {Object} schema - Validation schemas configuration
   * @param {Params} [schema.params] - Path parameters schema
   * @param {Query} [schema.query] - Query parameters schema
   * @param {Body} [schema.body] - Body schema
   * @param {Headers} [schema.headers] - Headers schema
   * @param {ResponseSchema} [schema.response] - Response schema
   * @param {string} [schema.description] - Route description
   * @param {string[]} [schema.tags] - Route tags
   * @returns {Hedystia<[...Routes, ...], Macros>} Instance with new route
   */
  put<
    Path extends string,
    Params extends ValidationSchema,
    Query extends ValidationSchema,
    Body extends ValidationSchema,
    Headers extends ValidationSchema,
    ResponseSchema extends ValidationSchema,
    EnabledMacros extends keyof Macros = never,
  >(
    path: Path,
    handler: (
      ctx: InferRouteContext<
        { params: Params; query: Query; body: Body; headers: Headers },
        Macros,
        EnabledMacros
      >,
    ) => Response | any | Promise<Response | any>,
    schema: {
      params?: Params;
      query?: Query;
      body?: Body;
      headers?: Headers;
      response?: ResponseSchema;
      description?: string;
      tags?: string[];
      test?: (
        context: TestContext<Params, Query, Body, Headers, ResponseSchema>,
      ) => Promise<void> | void;
    } & { [K in EnabledMacros]?: true } = {} as any,
  ): Hedystia<
    [
      ...Routes,
      {
        method: "PUT";
        path: Path;
        params: Params extends ValidationSchema ? InferOutput<Params> : {};
        query: Query extends ValidationSchema ? InferOutput<Query> : {};
        body: Body extends ValidationSchema ? InferOutput<Body> : unknown;
        headers: (Headers extends ValidationSchema
          ? InferOutput<Headers>
          : Record<string, string | null>) &
          (GlobalHeaders extends ValidationSchema ? InferOutput<GlobalHeaders> : {});
        response: ResponseSchema extends ValidationSchema ? InferOutput<ResponseSchema> : unknown;
      },
    ],
    Macros,
    GlobalHeaders
  > {
    this.addRoute("PUT", path, handler, schema);
    return this as any;
  }

  /**
   * Register a DELETE route handler
   * @param {Path} path - Route path
   * @param {(ctx: InferRouteContext)} handler - Request handler function
   * @param {Object} schema - Validation schemas configuration
   * @param {Params} [schema.params] - Path parameters schema
   * @param {Query} [schema.query] - Query parameters schema
   * @param {Body} [schema.body] - Body schema
   * @param {Headers} [schema.headers] - Headers schema
   * @param {ResponseSchema} [schema.response] - Response schema
   * @param {string} [schema.description] - Route description
   * @param {string[]} [schema.tags] - Route tags
   * @returns {Hedystia<[...Routes, ...], Macros>} Instance with new route
   */
  delete<
    Path extends string,
    Params extends ValidationSchema,
    Query extends ValidationSchema,
    Body extends ValidationSchema,
    Headers extends ValidationSchema,
    ResponseSchema extends ValidationSchema,
    EnabledMacros extends keyof Macros = never,
  >(
    path: Path,
    handler: (
      ctx: InferRouteContext<
        { params: Params; query: Query; body: Body; headers: Headers },
        Macros,
        EnabledMacros
      >,
    ) => Response | any | Promise<Response | any>,
    schema: {
      params?: Params;
      query?: Query;
      body?: Body;
      headers?: Headers;
      response?: ResponseSchema;
      description?: string;
      tags?: string[];
      test?: (
        context: TestContext<Params, Query, Body, Headers, ResponseSchema>,
      ) => Promise<void> | void;
    } & { [K in EnabledMacros]?: true } = {} as any,
  ): Hedystia<
    [
      ...Routes,
      {
        method: "DELETE";
        path: Path;
        params: Params extends ValidationSchema ? InferOutput<Params> : {};
        query: Query extends ValidationSchema ? InferOutput<Query> : {};
        body: Body extends ValidationSchema ? InferOutput<Body> : unknown;
        headers: (Headers extends ValidationSchema
          ? InferOutput<Headers>
          : Record<string, string | null>) &
          (GlobalHeaders extends ValidationSchema ? InferOutput<GlobalHeaders> : {});
        response: ResponseSchema extends ValidationSchema ? InferOutput<ResponseSchema> : unknown;
      },
    ],
    Macros,
    GlobalHeaders
  > {
    this.addRoute("DELETE", path, handler, schema);
    return this as any;
  }

  /**
   * Register a static route handler
   * @param {Path} path - Route path
   * @param {Response | Object} response - Static response configuration
   * @param {Object} schema - Response validation schema
   * @param {ResponseSchema} [schema.response] - Response schema
   * @returns {Hedystia<[...Routes, ...], Macros>} Instance with static route
   */
  static<
    Path extends string,
    ResponseSchema extends ValidationSchema = ValidationSchema,
    Headers extends ValidationSchema = ValidationSchema,
    ContentType extends string = string,
    ResponseBody = any,
  >(
    path: Path,
    response:
      | Response
      | (ResponseBody & { body?: never })
      | {
          body: ResponseBody;
          contentType?: ContentType;
          status?: number;
          headers?: Headers;
        },
    schema: {
      response?: ResponseSchema;
    } = {},
  ): Hedystia<
    [
      ...Routes,
      {
        method: "GET";
        path: Path;
        params: {};
        query: {};
        response: ResponseSchema extends ValidationSchema ? InferOutput<ResponseSchema> : unknown;
      },
    ],
    Macros,
    GlobalHeaders
  > {
    let finalResponse: Response;

    if (response instanceof Response) {
      finalResponse = response;
    } else {
      let body: any;
      let contentType: string | undefined;
      let status = 200;
      let headers: any = {};

      if (
        response &&
        typeof response === "object" &&
        "body" in (response as any) &&
        !Array.isArray(response) &&
        !(response instanceof Uint8Array) &&
        !(response instanceof ArrayBuffer) &&
        !(response instanceof Blob) &&
        !(response instanceof FormData)
      ) {
        const config = response as {
          body: any;
          contentType?: string;
          status?: number;
          headers?: any;
        };
        body = config.body;
        contentType = config.contentType;
        status = config.status ?? 200;
        headers = config.headers ?? {};
      } else if (isBunHTMLBundle(response)) {
        const anyBun = (globalThis as any).Bun;
        if (anyBun) {
          body = anyBun.file(response.index);
        } else {
          body = response;
        }
      } else {
        body = response;
      }

      const result = schema.response?.["~standard"]?.validate?.(body);
      if (result && typeof (result as any).then === "function") {
        (result as Promise<any>).then((validationResult) => {
          if ("issues" in validationResult) {
            throw new Error(
              `Static route response validation failed: ${JSON.stringify(validationResult.issues)}`,
            );
          }
        });
      } else if (result && "issues" in result) {
        throw new Error(
          `Static route response validation failed: ${JSON.stringify(result.issues)}`,
        );
      }

      if (
        typeof body === "string" ||
        body instanceof Uint8Array ||
        body instanceof ArrayBuffer ||
        body instanceof Blob ||
        body instanceof FormData
      ) {
        finalResponse = new Response(body as any, {
          status,
          headers: {
            "Content-Type": contentType || determineContentType(body),
            ...headers,
          },
        });
      } else {
        finalResponse = Response.json(body, {
          status,
          headers,
        });
      }
    }

    this.staticRoutes.push({
      path,
      response: finalResponse,
    });

    this.staticRoutesMap.set(path, finalResponse);

    return this as any;
  }

  public genericHandlers: GenericRequestHandler[] = [];

  /**
   * Register a generic request handler
   * @param {GenericRequestHandler} handler - Fallback request handler
   * @returns {this} Current instance
   */
  handle(handler: GenericRequestHandler): this {
    this.genericHandlers.push(handler);
    return this;
  }

  /**
   * Mount child framework instance
   * @param {Hedystia<ChildRoutes, ChildMacros>} childFramework - Child framework instance
   * @returns {Hedystia<[...Routes, ...ChildRoutes], MergeMacros<Macros, ChildMacros>>} Combined instance
   */
  use<ChildRoutes extends RouteDefinition[], ChildMacros extends MacroData = {}>(
    childFramework: Hedystia<ChildRoutes, ChildMacros>,
  ): Hedystia<[...Routes, ...ChildRoutes], MergeMacros<Macros, ChildMacros>, GlobalHeaders>;
  /**
   * Mount child framework instance with prefix
   * @param {Prefix} prefix - Path prefix
   * @param {Hedystia<ChildRoutes, ChildMacros>} childFramework - Child framework instance
   * @returns {Hedystia<[...Routes, ...], MergeMacros<Macros, ChildMacros>>} Combined instance
   */
  use<
    Prefix extends string,
    ChildRoutes extends RouteDefinition[],
    ChildMacros extends MacroData = {},
  >(
    prefix: Prefix,
    childFramework: Hedystia<ChildRoutes, ChildMacros>,
  ): Hedystia<
    [...Routes, ...PrefixRoutes<Prefix, ChildRoutes>],
    MergeMacros<Macros, ChildMacros>,
    GlobalHeaders
  >;
  use<
    PrefixOrChild extends string | Hedystia<any, any>,
    MaybeChild extends Hedystia<any, any> | undefined = undefined,
  >(
    prefixOrChildFramework: PrefixOrChild,
    maybeChildFramework?: MaybeChild,
  ): PrefixOrChild extends Hedystia<infer ChildRoutes, infer ChildMacros>
    ? Hedystia<[...Routes, ...ChildRoutes], MergeMacros<Macros, ChildMacros>, GlobalHeaders>
    : MaybeChild extends Hedystia<infer ChildRoutes, infer ChildMacros>
      ? Hedystia<
          [...Routes, ...PrefixRoutes<PrefixOrChild & string, ChildRoutes>],
          MergeMacros<Macros, ChildMacros>,
          GlobalHeaders
        >
      : never {
    let prefix = "";
    let childFramework: Hedystia<any>;

    if (prefixOrChildFramework instanceof Hedystia) {
      childFramework = prefixOrChildFramework;
    } else {
      prefix = prefixOrChildFramework;
      childFramework = maybeChildFramework as Hedystia<any>;
    }

    if (this.cors && !childFramework.cors) {
      childFramework.cors = this.cors;
    } else if (!this.cors && childFramework.cors) {
      this.cors = childFramework.cors;
    }

    for (const [key, macro] of Object.entries(childFramework.macros)) {
      if (!this.macros[key]) {
        this.macros[key] = macro;
      }
    }

    this.onRequestHandlers.push(...childFramework.onRequestHandlers);
    this.onParseHandlers.push(...childFramework.onParseHandlers);
    this.onTransformHandlers.push(...childFramework.onTransformHandlers);
    this.onBeforeHandleHandlers.push(...childFramework.onBeforeHandleHandlers);
    this.onAfterHandleHandlers.push(...childFramework.onAfterHandleHandlers);
    this.onMapResponseHandlers.push(...childFramework.onMapResponseHandlers);
    this.onErrorHandlers.push(...childFramework.onErrorHandlers);
    this.onAfterResponseHandlers.push(...childFramework.onAfterResponseHandlers);

    const fullPrefix = this.prefix + prefix;

    for (let i = 0; i < childFramework.routes.length; i++) {
      const route = childFramework.routes[i];
      if (route) {
        if (route.path === "/") {
          this.routes.push({
            ...route,
            path: fullPrefix,
          });
        } else {
          this.routes.push({
            ...route,
            path: fullPrefix + route.path,
          });
        }
      }
    }

    for (let i = 0; i < childFramework.staticRoutes.length; i++) {
      const staticRoute = childFramework.staticRoutes[i];
      if (staticRoute) {
        if (staticRoute.path === "/" && prefix !== "") {
          this.staticRoutes.push({
            path: fullPrefix,
            response: staticRoute.response,
          });
          this.staticRoutesMap.set(fullPrefix, staticRoute.response);
        } else {
          const finalPath = fullPrefix + staticRoute.path;
          this.staticRoutes.push({
            path: finalPath,
            response: staticRoute.response,
          });
          this.staticRoutesMap.set(finalPath, staticRoute.response);
        }
      }
    }

    for (const [path, handlerData] of childFramework.subscriptionHandlers.entries()) {
      const finalPath = fullPrefix === "/" ? path : fullPrefix + path;
      this.subscriptionHandlers.set(finalPath, handlerData);
    }

    return this as any;
  }

  /**
   * Conditionally register routes based on runtime conditions
   * Routes registered inside the callback are captured at the type level.
   * The callback can optionally return the app instance to propagate types.
   * @param {(app: Hedystia<[], Macros, GlobalHeaders>) => Hedystia<IfRoutes, Macros, GlobalHeaders> | void} callback
   * @returns {Hedystia<[...Routes, ...IfRoutes], Macros, GlobalHeaders>} Instance with merged routes
   */
  if<IfRoutes extends RouteDefinition[] = []>(
    callback: (
      app: Hedystia<[], Macros, GlobalHeaders>,
    ) => Hedystia<IfRoutes, Macros, GlobalHeaders> | undefined,
  ): Hedystia<[...Routes, ...IfRoutes], Macros, GlobalHeaders> {
    const ifApp = new Hedystia({ cors: this.cors }) as Hedystia<[], Macros, GlobalHeaders>;
    ifApp.prefix = this.prefix;
    ifApp.macros = { ...this.macros };

    const result = callback(ifApp);

    const sourceApp = result instanceof Hedystia ? result : ifApp;

    for (const route of (sourceApp as any).routes) {
      this.routes.push(route);
    }

    for (const staticRoute of (sourceApp as any).staticRoutes) {
      this.staticRoutes.push(staticRoute);
    }

    for (const [path, handlerData] of (sourceApp as any).subscriptionHandlers.entries()) {
      this.subscriptionHandlers.set(path, handlerData);
    }

    for (const [path, wsHandler] of (sourceApp as any).wsRoutes.entries()) {
      this.wsRoutes.set(path, wsHandler);
    }

    this.onRequestHandlers.push(...(sourceApp as any).onRequestHandlers);
    this.onParseHandlers.push(...(sourceApp as any).onParseHandlers);
    this.onTransformHandlers.push(...(sourceApp as any).onTransformHandlers);
    this.onBeforeHandleHandlers.push(...(sourceApp as any).onBeforeHandleHandlers);
    this.onAfterHandleHandlers.push(...(sourceApp as any).onAfterHandleHandlers);
    this.onMapResponseHandlers.push(...(sourceApp as any).onMapResponseHandlers);
    this.onErrorHandlers.push(...(sourceApp as any).onErrorHandlers);
    this.onAfterResponseHandlers.push(...(sourceApp as any).onAfterResponseHandlers);

    return this as any;
  }

  public wsRoutes: Map<string, WebSocketHandler & WebSocketOptions> = new Map();

  /**
   * Register WebSocket handler
   * @param {Path} path - WebSocket path
   * @param {WebSocketHandler} handler - WebSocket event handlers
   * @param {WebSocketOptions & { params?: Params }} [options] - WebSocket configuration
   * @returns {Hedystia<[...Routes, ...], Macros>} Instance with WebSocket route
   */
  ws<Path extends string, Params extends ValidationSchema = ValidationSchema>(
    path: Path,
    handler: WebSocketHandler,
    options: WebSocketOptions & {
      params?: Params;
    } = {},
  ): Hedystia<
    [
      ...Routes,
      {
        method: "WS";
        path: Path;
        params: Params extends ValidationSchema ? ValidationSchema : {};
        query: {};
        response: unknown;
      },
    ],
    Macros,
    GlobalHeaders
  > {
    const fullPath = this.prefix + path;
    this.wsRoutes.set(fullPath, { ...handler, ...options });
    return this as any;
  }
}
