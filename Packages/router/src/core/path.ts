import type { RawSearch, RouteNode } from "./types";

/** Match decoded URL segments and rank static routes ahead of params and splats. */
export function matchPath(pattern: string, pathname: string, exact = true) {
  const template = pattern.split("/").filter(Boolean);
  const segments = pathname.split("/").filter(Boolean);
  const params: Record<string, string> = Object.create(null);
  let score = 0;
  for (let index = 0; index < template.length; index++) {
    const part = template[index]!;
    if (part === "$" || part === "*") {
      if (index !== template.length - 1) {
        throw new TypeError("A splat must be the final route segment");
      }
      params._splat = segments.slice(index).map(decodeURIComponent).join("/");
      return { params, score: score + 1 };
    }
    const value = segments[index];
    if (value === undefined) {
      return;
    }
    if (part.startsWith("$") || part.startsWith(":")) {
      Object.defineProperty(params, part.slice(1), {
        value: decodeURIComponent(value),
        enumerable: true,
        configurable: true,
      });
      score += 2;
    } else {
      if (decodeURIComponent(part) !== decodeURIComponent(value)) {
        return;
      }
      score += 4;
    }
  }
  if (exact && template.length !== segments.length) {
    return;
  }
  return { params, score: score + 2 };
}

/** Select the most-specific branch through nested routes and pathless layouts. */
export function matchRoutes(
  routes: readonly RouteNode[],
  pathname: string,
): RouteNode[] | undefined {
  let best: { branch: RouteNode[]; score: number } | undefined;
  const visit = (nodes: readonly RouteNode[], parents: RouteNode[]) => {
    for (const route of nodes) {
      const branch = [...parents, route];
      if (route.path !== null && !matchPath(route.path, pathname, false)) {
        continue;
      }
      if (route.path !== null) {
        const match = matchPath(route.path, pathname);
        if (match) {
          const score = match.score * 100 + branch.length;
          if (!best || score > best.score) {
            best = { branch, score };
          }
        }
      }
      visit(route.children, branch);
    }
  };
  visit(routes, []);
  return best?.branch;
}

/** Parse repeated query parameters without inheriting object-prototype properties. */
export function readSearch(url: URL): RawSearch {
  const result: RawSearch = Object.create(null);
  for (const name of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(name);
    Object.defineProperty(result, name, {
      value: values.length > 1 ? values : values[0]!,
      enumerable: true,
    });
  }
  return result;
}

/** Build encoded internal links without allowing parameter values to alter the route structure. */
export function buildPath(path: string, params: Record<string, string | number> = {}): string {
  return path
    .split("/")
    .map((part) => {
      if (!part.startsWith("$") && !part.startsWith(":") && part !== "*") {
        return part;
      }
      const name = part === "$" || part === "*" ? "_splat" : part.slice(1);
      const value = params[name];
      if (value === undefined) {
        throw new TypeError(`Missing route parameter: ${name}`);
      }
      const pieces = name === "_splat" ? String(value).split("/") : [String(value)];
      if (pieces.some((piece) => !piece || piece === "." || piece === "..")) {
        throw new TypeError("Route parameter segments must not be empty, . or ..");
      }
      return pieces.map(encodeURIComponent).join("/");
    })
    .join("/");
}
