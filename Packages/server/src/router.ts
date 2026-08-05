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
  return normalized.split("/").filter(Boolean);
}

function decodeSegment(value: string): string {
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

  /**
   * Register a handler for a method and path.
   * @param method HTTP or framework method.
   * @param path Route pattern, supporting `:param` and `*wildcard` segments.
   * @param handler Value returned when the route matches.
   */
  add(method: string, path: string, handler: RouteHandler): void {
    const parts = splitPathSegments(path);
    let current = this.root;
    const paramNames: string[] = [];

    for (const part of parts) {
      if (part.startsWith(":")) {
        const name = part.slice(1) || "param";
        paramNames.push(name);
        if (!current.parametric) {
          current.parametric = { node: new Node(":"), name };
        }
        current = current.parametric.node;
        continue;
      }

      if (part.startsWith("*")) {
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
