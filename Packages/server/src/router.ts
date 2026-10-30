type RouteHandler = unknown;

type MethodEntry = {
  handler: RouteHandler;
  paramNames: string[];
};

function splitPathSegments(path: string): string[] {
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if (normalized === "/" || normalized === "") {
    return [];
  }
  const out: string[] = [];
  const len = normalized.length;
  let start = normalized.charCodeAt(0) === 47 ? 1 : 0;
  let index = start;
  while (index <= len) {
    if (index === len || normalized.charCodeAt(index) === 47) {
      if (index > start) {
        out.push(normalized.slice(start, index));
      }
      start = index + 1;
    }
    index++;
  }
  return out;
}

function decodeSegment(value: string): string {
  if (value.indexOf("%") === -1) {
    return value;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

class Node {
  readonly part: string;
  readonly children: Record<string, Node> = Object.create(null);
  parametric: { node: Node; name: string } | null = null;
  wildcard: { node: Node; name: string } | null = null;
  methods: Record<string, MethodEntry> | null = null;

  constructor(part: string) {
    this.part = part;
  }
}

/**
 * Small radix-style router used by the HTTP, SSE, and subscription layers.
 * Static segments take precedence over parameters, and parameters take
 * precedence over wildcards.
 */
export class Router {
  /** Root node of the route tree. */
  readonly root = new Node("/");

  private methodSet = new Set<string>();
  private hasDynamicRoutes = false;
  private staticEntries: Record<string, Record<string, MethodEntry>> = Object.create(null);

  /**
   * Register a handler for a method and path.
   * @param method HTTP or framework method.
   * @param path Route pattern, supporting `:param` and `*wildcard` segments.
   * @param handler Value returned when the route matches.
   */
  add(method: string, path: string, handler: RouteHandler): void {
    this.methodSet.add(method);
    const parts = splitPathSegments(path);
    let current = this.root;
    const paramNames: string[] = [];

    for (const part of parts) {
      if (part.startsWith(":")) {
        this.hasDynamicRoutes = true;
        const name = part.slice(1) || "param";
        paramNames.push(name);
        if (!current.parametric) {
          current.parametric = { node: new Node(":"), name };
        }
        current = current.parametric.node;
        continue;
      }

      if (part.startsWith("*")) {
        this.hasDynamicRoutes = true;
        const name = part.slice(1) || "wildcard";
        paramNames.push(name);
        if (!current.wildcard) {
          current.wildcard = { node: new Node("*"), name };
        }
        current = current.wildcard.node;
        continue;
      }

      current.children[part] ??= new Node(part);
      current = current.children[part]!;
    }

    current.methods ??= Object.create(null);
    current.methods[method] = { handler, paramNames };

    if (paramNames.length === 0) {
      if (this.staticEntries[path] === undefined) {
        this.staticEntries[path] = Object.create(null);
      }
      const byMethod = this.staticEntries[path] as Record<string, MethodEntry>;
      byMethod[method] = current.methods[method]!;
    }
  }

  /**
   * Find a handler for a method and request path.
   * @param method HTTP or framework method.
   * @param path Request pathname.
   * @returns The matched handler and decoded parameters, or `null`.
   */
  find(
    method: string,
    path: string,
  ): { handler: RouteHandler; params: Record<string, string> } | null {
    if (!this.methodSet.has(method)) {
      return null;
    }

    const staticEntry = this.staticEntries[path]?.[method];
    if (staticEntry) {
      return { handler: staticEntry.handler, params: {} };
    }

    if (!this.hasDynamicRoutes) {
      return null;
    }

    const parts = splitPathSegments(path);
    const result = this.match(this.root, parts, 0, method, []);
    if (!result) {
      return null;
    }

    const params: Record<string, string> = {};
    for (let index = 0; index < result.entry.paramNames.length; index++) {
      const name = result.entry.paramNames[index];
      const value = result.values[index];
      if (name && value !== undefined) {
        params[name] = value;
      }
    }
    return { handler: result.entry.handler, params };
  }

  private match(
    node: Node,
    parts: string[],
    index: number,
    method: string,
    values: string[],
  ): { entry: MethodEntry; values: string[] } | null {
    if (index === parts.length) {
      const entry = node.methods?.[method];
      if (entry) {
        return { entry, values };
      }
      // A wildcard can also match an empty suffix.
      if (node.wildcard) {
        const wildcardEntry = this.match(node.wildcard.node, parts, index, method, [...values, ""]);
        if (wildcardEntry) {
          return wildcardEntry;
        }
      }
      return null;
    }

    const part = parts[index]!;
    const staticNode = node.children[part];
    if (staticNode) {
      const staticMatch = this.match(staticNode, parts, index + 1, method, values);
      if (staticMatch) {
        return staticMatch;
      }
    }

    if (node.parametric) {
      const paramMatch = this.match(node.parametric.node, parts, index + 1, method, [
        ...values,
        decodeSegment(part),
      ]);
      if (paramMatch) {
        return paramMatch;
      }
    }

    if (node.wildcard) {
      for (let end = parts.length; end >= index; end--) {
        const remainder = parts.slice(index, end).map(decodeSegment).join("/");
        const wildcardMatch = this.match(node.wildcard.node, parts, end, method, [
          ...values,
          remainder,
        ]);
        if (wildcardMatch) {
          return wildcardMatch;
        }
      }
    }

    return null;
  }
}
