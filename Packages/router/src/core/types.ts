import type { JSX, ViewApp } from "@hedystia/view";

type SegmentParam<S extends string> = S extends "$" | "*"
  ? "_splat"
  : S extends `$${infer P}` | `:${infer P}`
    ? P
    : never;
type ParamNames<P extends string> = P extends `${infer H}/${infer T}`
  ? SegmentParam<H> | ParamNames<T>
  : SegmentParam<P>;
export type PathParams<P extends string> = { [K in ParamNames<P>]: string };
export type RawSearch = Record<string, string | string[]>;
export type LoadContext<P extends string | null, S> = {
  params: P extends string ? PathParams<P> : Record<string, string>;
  search: S;
  signal: AbortSignal;
  preload: boolean;
};
export type RenderContext<P extends string | null, S, D> = {
  params: () => P extends string ? PathParams<P> : Record<string, string>;
  search: () => S;
  data: () => D;
  outlet: () => JSX.Element;
};
export type ErrorContext = { error: unknown; retry: () => Promise<unknown> };
export type RouteOptions<P extends string | null, S, D> = {
  validateSearch?: (search: RawSearch) => S;
  beforeLoad?: (context: LoadContext<P, S>) => unknown | Promise<unknown>;
  loader?: (context: LoadContext<P, S>) => D | Promise<D>;
  loaderDeps?: (search: S) => unknown;
  staleTime?: number;
  preloadStaleTime?: number;
  component?: (props: RenderContext<P, S, D>) => JSX.Element;
  lazy?: () => Promise<{ default: (props: RenderContext<P, S, D>) => JSX.Element }>;
  errorComponent?: (props: ErrorContext) => JSX.Element;
};
export type RouteNode = Omit<RouteOptions<any, any, any>, "component" | "lazy"> & {
  component?: (props: any) => JSX.Element;
  lazy?: () => Promise<{ default: (props: any) => JSX.Element }>;
  id: string;
  path: string | null;
  children: readonly RouteNode[];
  _load?: () => Promise<{ Route: RouteNode }>;
};
export type Route<
  P extends string | null,
  I extends string,
  S,
  D,
  C extends readonly RouteNode[] = readonly [],
> = RouteOptions<P, S, D> & {
  id: I;
  path: P;
  children: C;
  readonly _types?: { search: S; data: D };
  _load?: () => Promise<{ Route: RouteNode }>;
  addChildren: <const N extends readonly RouteNode[]>(children: N) => Route<P, I, S, D, N>;
};
type Flatten<N, Depth extends unknown[] = []> = Depth["length"] extends 12
  ? never
  : N extends { children: infer C extends readonly unknown[] }
    ? N | Flatten<C[number], [...Depth, 0]>
    : N;
export type RoutesOf<R extends readonly RouteNode[]> = Flatten<R[number]>;
export type RoutePaths<R extends readonly RouteNode[]> = Extract<
  RoutesOf<R>,
  { path: string }
>["path"];
export type RouteAt<R extends readonly RouteNode[], P extends string> = Extract<
  RoutesOf<R>,
  { path: P }
>;
export type SearchOf<N> = N extends { readonly _types?: { search: infer S } } ? S : any;
export type DataOf<N> = N extends { readonly _types?: { data: infer D } } ? D : any;
type ParamsOption<P extends string> = keyof PathParams<P> extends never
  ? { params?: never }
  : { params: { [K in keyof PathParams<P>]: string | number } };
export type Navigation<R extends readonly RouteNode[], P extends RoutePaths<R>> = {
  to: P;
  hash?: string;
  replace?: boolean;
  resetScroll?: boolean;
  viewTransition?: boolean;
  signal?: AbortSignal;
} & ParamsOption<P> &
  (keyof SearchOf<RouteAt<R, P>> extends never
    ? { search?: never }
    : { search?: Partial<SearchOf<RouteAt<R, P>>> });
export type Match<N extends RouteNode = RouteNode> = {
  id: N["id"];
  route: N;
  params: Record<string, string>;
  search: SearchOf<N>;
  data: DataOf<N>;
};
export type RouterState = {
  status: "idle" | "pending" | "success" | "error" | "not-found";
  location: URL;
  matches: Match[];
  error?: unknown;
  errorIndex?: number;
};
export type RouterOptions<R extends readonly RouteNode[]> = {
  routes: R;
  initialUrl?: string;
  basepath?: string;
  staleTime?: number;
  preloadStaleTime?: number;
  window?: Window;
  viewTransitions?: boolean;
  pendingComponent?: () => JSX.Element;
  notFoundComponent?: () => JSX.Element;
  errorComponent?: (props: ErrorContext) => JSX.Element;
};
export type LinkOptions = {
  children?: JSX.Children;
  class?: string;
  activeClass?: string;
  target?: string;
  rel?: string;
  download?: string | boolean;
  preload?: boolean;
  onClick?: (event: MouseEvent) => void;
};
export type Router<R extends readonly RouteNode[]> = {
  state: () => RouterState;
  viewState: () => RouterState;
  options: RouterOptions<R>;
  href: <P extends RoutePaths<R>>(options: Navigation<R, P>) => string;
  navigate: <P extends RoutePaths<R>>(options: Navigation<R, P>) => Promise<RouterState>;
  preload: <P extends RoutePaths<R>>(options: Navigation<R, P>) => Promise<void>;
  load: (url?: string) => Promise<RouterState>;
  invalidate: () => Promise<RouterState>;
  match: <P extends RoutePaths<R>>(path: P) => Match<RouteAt<R, P>> | undefined;
  start: (root?: HTMLElement) => Promise<RouterState>;
  stop: () => void;
  mount: (root: HTMLElement) => ViewApp;
  Link: <P extends RoutePaths<R>>(props: Navigation<R, P> & LinkOptions) => JSX.Element;
};
