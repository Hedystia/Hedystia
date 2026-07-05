import type { Hedystia, RouteDefinition } from "hedystia";

export type ResponseFormat =
  | "json"
  | "text"
  | "formData"
  | "bytes"
  | "arrayBuffer"
  | "blob"
  | "stream";

export type SubscriptionCallback<M = any> = (event: {
  data?: any;
  error?: any;
  unsubscribe: () => void;
  send: (data: M) => void;
}) => void;
export type SubscriptionOptions = {
  headers?: Record<string, any>;
  query?: Record<string, any>;
  onMessage?: (message: any) => void;
  sse?: boolean;
};
export type Subscription<M = any> = { unsubscribe: () => void; send: (data: M) => void };

export type PathParts<Path extends string> = Path extends `/${infer Rest}`
  ? Rest extends ""
    ? []
    : Rest extends `${infer Head}/${infer Tail}`
      ? Tail extends ""
        ? [Head]
        : [Head, ...PathParts<`/${Tail}`>]
      : [Rest]
  : [];

export type HasRequiredKeys<T> = T extends undefined | null | never
  ? false
  : {} extends T
    ? false
    : true;

export type OptionalPart<Key extends string, T> = T extends undefined | never
  ? {}
  : HasRequiredKeys<T> extends true
    ? { [K in Key]: T }
    : { [K in Key]?: T };

export type RequestOptions<B, Q, H, M extends string> = {
  responseFormat?: ResponseFormat;
  credentials?: "omit" | "same-origin" | "include";
} & (M extends "GET" ? {} : OptionalPart<"body", B>) &
  OptionalPart<"query", Q> &
  OptionalPart<"headers", H>;

export type OptionsArgumentRequired<B, Q, H> = [
  HasRequiredKeys<B>,
  HasRequiredKeys<Q>,
  HasRequiredKeys<H>,
] extends [false, false, false]
  ? false
  : true;

export type RequestFunction<B, Q, H, M extends string, ResponseType, ErrorType> =
  OptionsArgumentRequired<M extends "GET" ? never : B, Q, H> extends true
    ? (options: RequestOptions<B, Q, H, M>) => Promise<{
        error: ErrorType | null;
        data: ResponseType | null;
        status: number;
        ok: boolean;
      }>
    : (options?: RequestOptions<B, Q, H, M>) => Promise<{
        error: ErrorType | null;
        data: ResponseType | null;
        status: number;
        ok: boolean;
      }>;

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

export type MergeMethodObjects<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};

export type RouteTuple<R extends RouteDefinition> = [
  R["method"],
  R["path"],
  R["params"],
  R["query"],
  R["body"],
  R["response"],
  R["headers"],
  R["data"],
  R["error"],
  R["message"],
];

export type RouteToFunction<RouteInfo> = RouteInfo extends [
  infer M extends string,
  any,
  any,
  infer Q,
  infer B,
  infer R,
  infer H,
  infer E,
]
  ? RequestFunction<B, Q, H, M, R, E>
  : never;

export type RouteToSubscription<RouteInfo> = RouteInfo extends [
  infer M,
  any,
  any,
  any,
  any,
  any,
  any,
  infer D,
  infer E,
  infer Msg,
]
  ? M extends "SUB"
    ? (
        callback: (event: {
          data?: D;
          error?: E;
          unsubscribe: () => void;
          send: (data: Msg) => void;
        }) => void,
        options?: SubscriptionOptions,
      ) => Subscription<Msg>
    : never
  : never;

export type RouteToWebSocket<RouteInfo> = RouteInfo extends [infer M, any, ...any[]]
  ? M extends "WS"
    ? (
        callback: (ws: {
          send(message: any): void;
          disconnect(): void;
          onConnect(callback: () => void): void;
          onMessage(callback: (message: any) => void): void;
          onError(callback: (error: Error) => void): void;
          onDisconnect(callback: () => void): void;
        }) => void,
      ) => { disconnect: () => void }
    : never
  : never;

export type RouteMetadata<R extends RouteDefinition> = {
  path: R["path"];
  params: R["params"];
  methods: MergeMethodObjects<
    {
      [M in R["method"] as M extends "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
        ? Lowercase<M>
        : never]: RouteToFunction<
        [M, R["path"], R["params"], R["query"], R["body"], R["response"], R["headers"], R["error"]]
      >;
    } & {
      [M in R["method"] as M extends "SUB" ? "subscribe" : never]: RouteToSubscription<
        RouteTuple<R>
      >;
    } & {
      [M in R["method"] as M extends "WS" ? "ws" : never]: RouteToWebSocket<RouteTuple<R>>;
    }
  >;
};

export type SegmentsToNode<
  Segments extends string[],
  R extends RouteDefinition,
> = Segments extends [infer Head extends string, ...infer Tail extends string[]]
  ? { [K in Head]: SegmentsToNode<Tail, R> }
  : { __meta: RouteMetadata<R> };

export type RouteToTree<R extends RouteDefinition> = SegmentsToNode<PathParts<R["path"]>, R>;

export type RoutesToTree<R extends RouteDefinition> = R extends any ? RouteToTree<R> : never;

export type TreeToClient<Node> = (Node extends { __meta: { methods: infer M } } ? M : {}) & {
  [K in keyof Node as K extends `__${string}`
    ? never
    : K extends `:${infer Param}`
      ? Param
      : K]: K extends `:${infer Param}`
    ? (
        value: Node[K] extends { __meta: { params: infer P } }
          ? P[Param & keyof P]
          : string | number,
      ) => TreeToClient<Node[K]>
    : TreeToClient<Node[K]>;
};

export type ClientTree<R extends RouteDefinition> = TreeToClient<
  UnionToIntersection<RoutesToTree<R>>
>;

export type ExtractRoutes<T extends RouteDefinition[]> = T[number];

export type ExtractRoutesFromFramework<T> =
  T extends Hedystia<infer R> ? ExtractRoutes<R> : T extends RouteDefinition[] ? T[number] : never;
