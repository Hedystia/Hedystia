import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";
import type { SecurityOptions } from "../security";

export type ValidationSchema = StandardSchemaV1<any, any>;
export type JSONValidationSchema = StandardJSONSchemaV1<any, any>;

export type InferInput<T> = T extends { readonly inferred: any }
  ? T extends StandardSchemaV1<infer I, any>
    ? I
    : any
  : T extends StandardSchemaV1<infer I, any>
    ? I
    : T extends StandardJSONSchemaV1<infer I, any>
      ? I
      : any;

export type InferOutput<T> = T extends { readonly inferred: infer O }
  ? O
  : T extends StandardSchemaV1<any, infer O>
    ? O
    : T extends StandardJSONSchemaV1<any, infer O>
      ? O
      : any;

export type Infer<T> = InferOutput<T>;

export interface RouteDefinition {
  method: "GET" | "PATCH" | "POST" | "PUT" | "DELETE" | "WS" | "SUB";
  path: string;
  params?: unknown;
  query?: unknown;
  headers?: unknown;
  body?: unknown;
  response?: unknown;
  data?: unknown;
  error?: unknown;
  message?: unknown;
  security?: SecurityOptions | false;
}

export interface RouteInfo {
  method: string;
  path: string;
  params?: unknown;
  query?: unknown;
  headers?: unknown;
  body?: unknown;
  response?: unknown;
  data?: unknown;
  error?: unknown;
  security?: SecurityOptions | false;
}

export type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
};

export type ResponseContext = {
  status: (code: number) => ResponseContext;
  headers: {
    set: (key: string, value: string) => ResponseContext;
    get: (key: string) => string | null;
    delete: (key: string) => ResponseContext;
    add: (key: string, value: string) => ResponseContext;
  };
  cookies: {
    get: (name: string) => string | undefined;
    set: (name: string, value: string, options?: CookieOptions) => ResponseContext;
    delete: (name: string, options?: Omit<CookieOptions, "expires">) => ResponseContext;
  };
};

export type RouteSchema = {
  params?: ValidationSchema;
  query?: ValidationSchema;
  body?: ValidationSchema;
  headers?: ValidationSchema;
  response?: ValidationSchema & { _type?: any };
  data?: ValidationSchema & { _type?: any };
  error?: ValidationSchema & { _type?: any };
  message?: ValidationSchema & { _type?: any };
  description?: string;
  tags?: string[];
  security?: SecurityOptions | false;
};

export type StreamContext = {
  write: (chunk: string | Uint8Array) => StreamContext;
  end: (chunk?: string | Uint8Array) => void;
};

export type InferRouteContext<
  T extends RouteSchema,
  M extends MacroData = {},
  EnabledMacros extends keyof M = never,
> = {
  req: Request;
  params: T["params"] extends ValidationSchema ? InferOutput<T["params"]> : {};
  query: T["query"] extends ValidationSchema ? InferOutput<T["query"]> : {};
  body: T["body"] extends ValidationSchema ? InferOutput<T["body"]> : unknown;
  rawBody?: string | ArrayBuffer | Uint8Array;
  headers: T["headers"] extends ValidationSchema
    ? InferOutput<T["headers"]>
    : Record<string, string | null>;
  rawHeaders: Record<string, string>;
  error: (statusCode: number, message?: string) => never;
  set: ResponseContext;
  stream: StreamContext;
  requestId?: string;
} & Pick<M, EnabledMacros>;

export type CorsOptions = {
  origin?:
    | string
    | string[]
    | boolean
    | ((origin: string | undefined) => boolean | Promise<boolean>);
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
  credentials?: boolean;
  maxAge?: number;
};

export type PrefixRoutes<Prefix extends string, T extends RouteDefinition[]> = {
  [K in keyof T]: T[K] extends RouteDefinition
    ? {
        method: T[K]["method"];
        path: `${Prefix}${T[K]["path"]}`;
        params: T[K]["params"];
        query: T[K]["query"];
        headers: T[K]["headers"];
        body: T[K] extends { body: infer B } ? B : undefined;
        response: T[K] extends { response: infer R } ? R : undefined;
        data: T[K] extends { data: infer D } ? D : undefined;
        error: T[K] extends { error: infer E } ? E : undefined;
        security: T[K] extends { security: infer S } ? S : undefined;
      }
    : never;
};

export type ContextTypes<T extends RouteSchema = {}, Routes extends RouteDefinition[] = []> = {
  req: Request;
  params: T["params"] extends ValidationSchema ? InferOutput<T["params"]> : Record<string, any>;
  query: T["query"] extends ValidationSchema ? InferOutput<T["query"]> : Record<string, any>;
  body: T["body"] extends ValidationSchema ? InferOutput<T["body"]> : any;
  rawBody?: string | ArrayBuffer | Uint8Array;
  headers: T["headers"] extends ValidationSchema
    ? InferOutput<T["headers"]>
    : Record<string, string | null>;
  rawHeaders: Record<string, string>;
  route?: string;
  method?: string;
  error: (statusCode: number, message?: string) => never;
  set: ResponseContext;
  publish: PublishMethod<Routes>;
  stream: StreamContext;
  requestId?: string;
};

export type RequestHandler = (ctx: ContextTypes) => Response | Promise<Response>;
export type GenericRequestHandler = (request: Request) => Response | Promise<Response>;

export type MacroResolveFunction<T extends RouteSchema = {}> = (
  ctx: ContextTypes<T>,
) => T | Promise<T>;

export type MacroData = Record<string, any>;

export type MergeMacros<M1 extends MacroData, M2 extends MacroData> = {
  [K in keyof M1 | keyof M2]: K extends keyof M2 ? M2[K] : K extends keyof M1 ? M1[K] : never;
};

export type WebSocketHandler = {
  message: (ws: ServerWebSocket, message: string | ArrayBuffer | Uint8Array) => void;
  open?: (ws: ServerWebSocket) => void;
  close?: (ws: ServerWebSocket, code: number, reason: string) => void;
  error?: (ws: ServerWebSocket, error: Error) => void;
  drain?: (ws: ServerWebSocket) => void;
};

type Compressor =
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

export type WebSocketOptions = {
  maxPayloadLength?: number;
  idleTimeout?: number;
  backpressureLimit?: number;
  closeOnBackpressureLimit?: boolean;
  sendPings?: boolean;
  publishToSelf?: boolean;
  perMessageDeflate?:
    | boolean
    | {
        compress?: boolean | Compressor;
        decompress?: boolean | Compressor;
      };
};

export interface ServerWebSocket {
  readonly data: any;
  readonly readyState: number;
  readonly remoteAddress: string;
  send(message: string | ArrayBuffer | Uint8Array, compress?: boolean): number;
  close(code?: number, reason?: string): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  publish(topic: string, message: string | ArrayBuffer | Uint8Array): void;
  isSubscribed(topic: string): boolean;
  cork(cb: (ws: ServerWebSocket) => void): void;
}

export type SubscriptionContext<
  T extends RouteSchema = {},
  M extends MacroData = {},
  EnabledMacros extends keyof M = never,
> = Omit<ContextTypes<T>, "set" | "stream"> & {
  ws: ServerWebSocket;
  rawHeaders: Record<string, string>;
  data: T["data"] extends ValidationSchema ? InferOutput<T["data"]> : any;
  errorData: T["error"] extends ValidationSchema ? InferOutput<T["error"]> : any;
  sendData: (
    data: T["data"] extends ValidationSchema ? InferOutput<T["data"]> : any,
    targetId?: string,
  ) => void;
  sendError: (
    error: T["error"] extends ValidationSchema ? InferOutput<T["error"]> : any,
    targetId?: string,
  ) => void;
  isActive: () => Promise<boolean>;
  subscriptionId: string;
  onMessage: (
    callback: (
      message: T["message"] extends ValidationSchema ? InferOutput<T["message"]> : any,
    ) => void | Promise<void>,
  ) => void;
} & Pick<M, EnabledMacros>;
export type SubscriptionHandler = (ctx: SubscriptionContext<any, any, any>) => any | Promise<any>;

export type SubscriptionLifecycleContext = {
  path: string;
  subscriptionId: string;
  ws: ServerWebSocket;
  reason?: "disconnect" | "timeout" | "unsubscribe" | "error";
  isActive: () => Promise<boolean>;
  publish: (data: any, targetId?: string) => void;
};

type ExtractSubscriptionMessageRoutes<Routes extends RouteDefinition[]> = {
  [K in keyof Routes]: Routes[K] extends {
    method: "SUB";
    path: infer P;
    params: infer Params;
    data: infer D;
    error: infer E;
    message: infer M;
  }
    ? { path: ResolveParams<P & string, Params>; data: D; error: E; message: M }
    : Routes[K] extends {
          method: "SUB";
          path: infer P;
          params: infer Params;
          data: infer D;
          error: infer E;
        }
      ? { path: ResolveParams<P & string, Params>; data: D; error: E; message: any }
      : Routes[K] extends { method: "SUB"; path: infer P }
        ? { path: P; data: any; error: any; message: any }
        : never;
}[number];

type SubscriptionMessageRouteToContext<T> = T extends {
  path: infer P;
  data: infer D;
  error: infer E;
  message: infer M;
}
  ? {
      path: P;
      subscriptionId: string;
      ws: ServerWebSocket;
      message: M;
      isActive: () => Promise<boolean>;
      sendData: (data: D) => void;
      sendError: (error: E) => void;
    }
  : never;

export type SubscriptionMessageContext<Routes extends RouteDefinition[] = []> =
  ExtractSubscriptionMessageRoutes<Routes> extends never
    ? {
        path: string;
        subscriptionId: string;
        ws: ServerWebSocket;
        message: any;
        isActive: () => Promise<boolean>;
        sendData: (data: any) => void;
        sendError: (error: any) => void;
      }
    : SubscriptionMessageRouteToContext<ExtractSubscriptionMessageRoutes<Routes>>;

type ResolveParams<Path extends string, Params = any> =
  Params extends Record<string, any>
    ? ResolveParamsWithTypes<Path, Params>
    : ResolveParamsWithoutTypes<Path>;

type ResolveParamsWithTypes<
  T extends string,
  Params extends Record<string, any>,
> = T extends `${infer Before}:${infer ParamName}/${infer After}`
  ? ParamName extends keyof Params
    ? `${Before}${Params[ParamName] extends number ? number : string}/${ResolveParamsWithTypes<After, Params>}`
    : `${Before}:${ParamName}/${ResolveParamsWithTypes<After, Params>}`
  : T extends `${infer Before}:${infer ParamName}`
    ? ParamName extends keyof Params
      ? `${Before}${Params[ParamName] extends number ? number : string}`
      : `${Before}:${ParamName}`
    : T;

type ResolveParamsWithoutTypes<T extends string> = T extends `${infer Before}:${infer ParamAndRest}`
  ? ParamAndRest extends `${infer _Param}/${infer After}`
    ? `${Before}${string}/${ResolveParamsWithoutTypes<After>}`
    : `${Before}${string}`
  : T;

export type ExtractSubscriptionRoutes<Routes extends RouteDefinition[]> = {
  [K in keyof Routes]: Routes[K] extends {
    method: "SUB";
    path: infer P;
    params: infer Params;
    data: infer D;
    error: infer E;
  }
    ? { path: ResolveParams<P & string, Params>; data: D; error: E }
    : never;
}[number];

export type PublishOptions<Data = any, Error = any> = {
  data?: Data;
  error?: Error;
  compress?: boolean;
};

export type PublishMethod<Routes extends RouteDefinition[]> = <
  T extends ExtractSubscriptionRoutes<Routes>,
>(
  topic: T["path"],
  options: T extends { data: infer D; error: infer E }
    ? PublishOptions<D, E> & ({ data: D; error?: never } | { data?: never; error: E })
    : PublishOptions,
) => void;

type PathParts<Path extends string> = Path extends `/${infer Rest}`
  ? Rest extends ""
    ? []
    : PathPartsInner<Rest>
  : [];

type PathPartsInner<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? [Head, ...PathPartsInner<Tail>]
  : [Path];

type SubscriptionRouteToMeta<R extends RouteDefinition> = R extends {
  method: "SUB";
  path: infer P;
  data: infer D;
  error: infer E;
  message: infer M;
}
  ? { path: P; data: D; error: E; message: M }
  : R extends { method: "SUB"; path: infer P; data: infer D; error: infer E }
    ? { path: P; data: D; error: E; message: any }
    : R extends { method: "SUB"; path: infer P }
      ? { path: P; data: any; error: any; message: any }
      : never;

type SegmentsToPublishNode<
  Segments extends string[],
  Meta extends { data: any; error: any },
> = Segments extends [infer Head extends string, ...infer Tail extends string[]]
  ? { [K in Head]: SegmentsToPublishNode<Tail, Meta> }
  : (options: PublishOptions<Meta["data"], Meta["error"]>) => void;

type SubscriptionRouteToTree<R extends RouteDefinition> = R extends { method: "SUB" }
  ? SegmentsToPublishNode<PathParts<R["path"] & string>, { data: R["data"]; error: R["error"] }>
  : {};

type UnionToIntersectionServer<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

export type PublishTree<Routes extends RouteDefinition[]> = UnionToIntersectionServer<
  SubscriptionRouteToTree<Routes[number]>
>;

type SegmentsToMessageNode<
  Segments extends string[],
  Meta extends { data: any; error: any; message: any; path: string },
> = Segments extends [infer Head extends string, ...infer Tail extends string[]]
  ? { [K in Head]: SegmentsToMessageNode<Tail, Meta> }
  : {
      path: Meta["path"];
      message: Meta["message"];
      sendData: (data: Meta["data"]) => void;
      sendError: (error: Meta["error"]) => void;
    };

type SubscriptionRouteToMessageTree<R extends RouteDefinition> = R extends { method: "SUB" }
  ? SegmentsToMessageNode<PathParts<R["path"] & string>, SubscriptionRouteToMeta<R>>
  : {};

export type SubscriptionMessageTree<Routes extends RouteDefinition[]> = UnionToIntersectionServer<
  SubscriptionRouteToMessageTree<Routes[number]>
>;

export type IterableSource<T> = Iterable<T> | AsyncIterable<T>;

export interface BaseEvent {
  type: string;
  message?: string;
  data?: unknown;
  error?: unknown;
  stream?: boolean;
  chunkSize?: number;
}

export type EventMap = Record<string, BaseEvent>;

export type EmitPayload<T, K extends keyof T> = T[K] extends BaseEvent
  ? Omit<T[K], "type" | "stream" | "chunkSize">
  : never;

export interface EmitterConfig {
  headers?: Record<string, string>;
}

export type EventHandler<T> = (data: T) => void;

export interface ClientInfo {
  writer: WritableStreamDefaultWriter;
  cleanup: (reason?: unknown) => Promise<void>;
  subscriptions: Map<string, string>;
}
