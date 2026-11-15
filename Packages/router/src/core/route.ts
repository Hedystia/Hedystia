import type { Route, RouteNode, RouteOptions } from "./types";

/** Construct immutable route definitions while preserving their exact children and data types. */
function define<P extends string | null, I extends string, S, D, C extends readonly RouteNode[]>(
  path: P,
  id: I,
  options: RouteOptions<P, S, D>,
  children: C,
): Route<P, I, S, D, C> {
  return { ...options, path, id, children, addChildren: (next) => define(path, id, options, next) };
}

/** Define a typed full-path route, using $name parameters and a final $ splat. */
export function createRoute<const P extends string, S extends object = {}, D = undefined>(
  path: P,
  options: RouteOptions<P, S, D> = {},
): Route<P, P, S, D> {
  if (!path.startsWith("/") || path.includes("//") || /[?#\\]/.test(path)) {
    throw new TypeError("Route paths must be absolute paths without query, hash or backslashes");
  }
  const names = new Set<string>();
  for (const segment of path.split("/")) {
    const decoded = decodeURIComponent(segment);
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      throw new TypeError("Invalid route segment");
    }
    if (segment.startsWith("$") || segment.startsWith(":")) {
      const name = segment.slice(1) || "_splat";
      if (names.has(name)) {
        throw new TypeError("Route parameter names must be unique");
      }
      names.add(name);
    }
  }
  return define(path, path, options, [] as const);
}

/** Define a pathless layout or root without consuming a URL segment. */
export function createLayout<const I extends string>(
  id: I,
  options: RouteOptions<null, {}, undefined> = {},
): Route<null, I, {}, undefined> {
  if (!id) {
    throw new TypeError("Layout ids must not be empty");
  }
  return define(null, id, options, [] as const);
}

/** Keep generated route modules out of the initial bundle while preserving their exported types. */
export function lazyRoute<P extends string | null, R extends RouteNode & { path: NoInfer<P> }>(
  path: P,
  load: () => Promise<{ Route: R }>,
  id: string = path ?? "root",
): R {
  const wrap = (
    children: readonly RouteNode[],
  ): RouteNode & { addChildren: (children: readonly RouteNode[]) => unknown } => ({
    path,
    id,
    children,
    _load: load,
    addChildren: (next) => wrap(next),
  });
  return wrap([]) as unknown as R;
}

export class Redirect extends Error {
  /** Redirect internally after guards or loaders without accepting an external destination. */
  constructor(
    readonly href: string,
    readonly replace = true,
  ) {
    super("Route redirect");
  }
}

/** Create an internal redirect to throw from a guard or loader. */
export function redirect(href: string, options: { replace?: boolean } = {}): Redirect {
  return new Redirect(href, options.replace ?? true);
}

export class NotFound extends Error {
  /** Distinguish missing route data from an application failure. */
  constructor() {
    super("Route not found");
  }
}

/** Create a missing-resource outcome to throw from a loader. */
export function notFound(): NotFound {
  return new NotFound();
}
