import type { Hedystia, RouteDefinition } from "hedystia";
import type { WebSocketCallback } from "./managers";
import { SubscriptionManager, WebSocketManager } from "./managers";
import type {
  ClientTree,
  ExtractRoutesFromFramework,
  SubscriptionCallback,
  SubscriptionOptions,
} from "./types";
import { processResponse } from "./utils";

/**
 * Create client for Hedystia framework
 * @param {string} baseUrl - Base URL for client
 * @returns {ClientTree<ExtractRoutesFromFramework<T>>} Client instance
 */
export function createClient<T extends Hedystia<any> | RouteDefinition[]>(
  baseUrl: string,
  clientOptions?: {
    credentials?: "omit" | "same-origin" | "include";
    headers?: Record<string, string>;
    sse?: boolean;
    debugLevel?: "none" | "debug" | "warn" | "log" | "error";
  },
): ClientTree<ExtractRoutesFromFramework<T>> {
  const HTTP_METHODS = ["get", "put", "post", "patch", "delete"];
  const subscriptionManager = new SubscriptionManager(
    baseUrl,
    clientOptions?.credentials,
    clientOptions?.sse,
    clientOptions?.debugLevel,
    clientOptions?.headers,
  );
  const wsManager = new WebSocketManager(
    baseUrl,
    clientOptions?.debugLevel,
    clientOptions?.headers,
  );

  const createProxy = (segments: string[] = []): any => {
    const proxyTarget = () => {};
    return new Proxy(proxyTarget, {
      get(_target, prop: string | symbol, receiver) {
        if (typeof prop !== "string") {
          return Reflect.get(_target, prop, receiver);
        }
        if (prop === "then") {
          return undefined;
        }
        if (prop.toLowerCase() === "subscribe") {
          const fullPath = `/${segments.filter(Boolean).join("/")}`;
          return (callback: SubscriptionCallback, options?: SubscriptionOptions) => {
            return subscriptionManager.subscribe(fullPath, callback, options);
          };
        }
        if (prop.toLowerCase() === "ws") {
          const fullPath = `/${segments.filter(Boolean).join("/")}`;
          return (callback: WebSocketCallback) => {
            return wsManager.connect(fullPath, callback);
          };
        }
        if (HTTP_METHODS.includes(prop.toLowerCase())) {
          return createProxy([...segments, prop]);
        }
        return createProxy([...segments, prop]);
      },
      apply(_target, _thisArg, args) {
        const lastSegment = segments[segments.length - 1];
        if (lastSegment && HTTP_METHODS.includes(lastSegment.toLowerCase())) {
          const method = lastSegment.toUpperCase() as "GET" | "PATCH" | "POST" | "PUT" | "DELETE";
          const pathSegments = segments.slice(0, segments.length - 1);
          const fullPath =
            pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === "")
              ? "/"
              : `/${pathSegments.filter((s) => s !== "").join("/")}`;
          const url = new URL(fullPath, baseUrl);

          const options = args[0] || {};
          const { body, query, headers, responseFormat = "json", credentials } = options;

          if (query && typeof query === "object") {
            url.search = new URLSearchParams(query as any).toString();
          }

          const init: RequestInit = {
            method,
            credentials: credentials ?? clientOptions?.credentials,
            headers: {
              ...(body && !(body instanceof FormData)
                ? { "Content-Type": "application/json" }
                : {}),
              ...clientOptions?.headers,
              ...headers,
            },
          };
          if (body !== undefined && method !== "GET") {
            if (body instanceof FormData) {
              init.body = body;
            } else {
              init.body = JSON.stringify(body);
            }
          }

          return (async () => {
            try {
              const res = await fetch(url.toString(), init);
              const status = res.status;
              const ok = res.ok;

              if (responseFormat === "stream") {
                return { error: null, data: res.body, status, ok };
              }

              if (!ok) {
                const errorData = await processResponse(res, responseFormat);
                return { error: errorData, data: null, status, ok };
              }

              const data = await processResponse(res, responseFormat);
              return { error: null, data, status, ok };
            } catch (error) {
              return { error, data: null, status: 0, ok: false };
            }
          })();
        }
        const value = args[0];
        const newSegments = segments.slice(0, segments.length - 1).concat(String(value));
        return createProxy(newSegments);
      },
    });
  };

  return createProxy();
}
