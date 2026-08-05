export type SanitizationMode = "strip" | "reject";

export interface SanitizationOptions {
  /** Remove or reject prototype-pollution keys. Defaults to `strip`. */
  mode?: SanitizationMode;
  /** Trim string values before validation. Defaults to `false`. */
  trimStrings?: boolean;
  /** Reject strings longer than this value. */
  maxStringLength?: number;
  /** Maximum nested object/array depth. Defaults to `20`. */
  maxDepth?: number;
}

export type RateLimitKey = "global" | "ip" | ((request: Request) => string);

export interface RateLimitStore {
  consume(
    key: string,
    windowMs: number,
    limit: number,
  ): Promise<{ count: number; resetAt: number }> | { count: number; resetAt: number };
}

export interface RateLimitOptions {
  /** Duration of the rate-limit window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Key used to separate clients. `ip` uses proxy headers only when `trustProxy` is enabled. */
  key?: RateLimitKey;
  /** Trust `X-Forwarded-For` and `X-Real-IP` when using the `ip` key. Defaults to `false`. */
  trustProxy?: boolean;
  /** Store implementation for distributed deployments. */
  store?: RateLimitStore;
  /** Include `RateLimit-*` and `Retry-After` response headers. Defaults to `true`. */
  headers?: boolean;
}

export type SecurityHeadersPreset = "basic" | "recommended" | "strict";

export interface SecurityHeadersOptions {
  /** Header preset. Defaults to `recommended`. */
  preset?: SecurityHeadersPreset;
  /** Explicit headers override or extend the selected preset. */
  values?: Record<string, string>;
}

export interface SecurityOptions {
  /** Maximum request body size in bytes. */
  bodyLimit?: number;
  /** Maximum number of URL query parameters. */
  maxQueryParameters?: number;
  /** Maximum bracket/dot nesting depth in query keys. */
  maxQueryDepth?: number;
  /** Protect request values against dangerous keys and excessive nesting. */
  sanitize?: boolean | SanitizationOptions;
  /** Add security response headers. */
  headers?: false | SecurityHeadersOptions;
  /** Add a stable `X-Request-ID` response header and expose it in the context. */
  requestId?: boolean | { header?: string };
  /** Limit requests globally or per route. */
  rateLimit?: false | RateLimitOptions;
  /** Maximum time allowed for handler and middleware processing. */
  timeout?: number;
}

export class SecurityInputError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "SecurityInputError";
    this.statusCode = statusCode;
  }
}

export class RequestTimeoutError extends Error {
  readonly statusCode = 408;

  constructor() {
    super("Request timed out");
    this.name = "RequestTimeoutError";
  }
}

export class RateLimitError extends Error {
  readonly statusCode = 429;
  readonly rateLimit: { limit: number; remaining: number; resetAt: number };

  constructor(limit: number, count: number, resetAt: number) {
    super("Too Many Requests");
    this.name = "RateLimitError";
    this.rateLimit = {
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }
}

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Clone request data while removing or rejecting prototype-pollution keys.
 * This intentionally does not HTML-escape strings: output encoding belongs at
 * the rendering boundary, not in an API input sanitizer.
 */
export function sanitizeInput<T>(value: T, options: SanitizationOptions = {}): T {
  const mode = options.mode ?? "strip";
  const maxDepth = options.maxDepth ?? 20;

  const visit = (current: unknown, depth: number, path: string): unknown => {
    if (depth > maxDepth) {
      throw new SecurityInputError(`Input nesting exceeds the maximum depth at ${path || "input"}`);
    }

    if (typeof current === "string") {
      if (options.maxStringLength !== undefined && current.length > options.maxStringLength) {
        throw new SecurityInputError(
          `Input string exceeds the maximum length at ${path || "input"}`,
        );
      }
      return options.trimStrings ? current.trim() : current;
    }

    if (Array.isArray(current)) {
      return current.map((item, index) => visit(item, depth + 1, `${path}[${index}]`));
    }

    if (!isPlainObject(current)) {
      return current;
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(current)) {
      if (DANGEROUS_KEYS.has(key)) {
        if (mode === "reject") {
          throw new SecurityInputError(`Dangerous input key "${key}" is not allowed`);
        }
        continue;
      }
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value: visit(item, depth + 1, path ? `${path}.${key}` : key),
        writable: true,
      });
    }
    return output;
  };

  return visit(value, 0, "") as T;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  consume(key: string, windowMs: number, _limit: number): { count: number; resetAt: number } {
    const now = Date.now();
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      const next = { count: 1, resetAt: now + windowMs };
      this.entries.set(key, next);
      return next;
    }

    current.count += 1;
    if (this.entries.size > 10_000) {
      for (const [entryKey, entry] of this.entries) {
        if (entry.resetAt <= now) {
          this.entries.delete(entryKey);
        }
      }
    }
    return current;
  }
}

export function getRateLimitKey(
  request: Request,
  key: RateLimitKey = "global",
  trustProxy = false,
): string {
  if (typeof key === "function") {
    return key(request);
  }
  if (key === "ip") {
    const forwarded = trustProxy
      ? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
      : undefined;
    const realIp = trustProxy ? request.headers.get("x-real-ip") : undefined;
    return `ip:${forwarded || realIp || "unknown"}`;
  }
  return "global";
}

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getSafeRequestIdHeader(header?: string): string {
  return header && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,128}$/.test(header) ? header : "X-Request-ID";
}

export function getRequestId(request: Request, header = "X-Request-ID"): string {
  const supplied = request.headers.get(getSafeRequestIdHeader(header));
  if (supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)) {
    return supplied;
  }
  return createRequestId();
}

export function assertRequestLimits(
  request: Request,
  options: Pick<SecurityOptions, "bodyLimit" | "maxQueryParameters" | "maxQueryDepth">,
): void {
  if (options.bodyLimit !== undefined) {
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
      const parsedLength = Number(contentLength);
      if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
        throw new SecurityInputError("Invalid Content-Length header");
      }
      if (parsedLength > options.bodyLimit) {
        throw new SecurityInputError("Request body exceeds the maximum allowed size", 413);
      }
    }
  }

  const url = new URL(request.url);
  if (
    options.maxQueryParameters !== undefined &&
    [...url.searchParams].length > options.maxQueryParameters
  ) {
    throw new SecurityInputError("Too many query parameters");
  }
  if (options.maxQueryDepth !== undefined) {
    for (const key of url.searchParams.keys()) {
      const depth = (key.match(/[.[\]]/g) || []).length;
      if (depth > options.maxQueryDepth) {
        throw new SecurityInputError("Query parameter nesting exceeds the maximum allowed depth");
      }
    }
  }
}

export async function consumeRateLimit(
  request: Request,
  options: RateLimitOptions,
  fallbackStore: RateLimitStore,
): Promise<{ count: number; resetAt: number }> {
  const store = options.store ?? fallbackStore;
  return await store.consume(
    getRateLimitKey(request, options.key, options.trustProxy),
    options.windowMs,
    options.limit,
  );
}

export async function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new RequestTimeoutError()), timeout);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export const SECURITY_HEADERS: Record<SecurityHeadersPreset, Record<string, string>> = {
  basic: {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  },
  recommended: {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  },
  strict: {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
  },
};

export function getSecurityHeaders(options: SecurityHeadersOptions): Record<string, string> {
  return {
    ...SECURITY_HEADERS[options.preset ?? "recommended"],
    ...options.values,
  };
}

export function applySecurityResponse(
  response: Response,
  options: SecurityOptions,
  requestId?: string,
  rateLimit?: { limit: number; count: number; resetAt: number },
): Response {
  const headers = new Headers(response.headers);
  if (options.headers !== false && options.headers) {
    for (const [key, value] of Object.entries(getSecurityHeaders(options.headers))) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }
  }
  if (requestId && options.requestId) {
    const header =
      typeof options.requestId === "object"
        ? getSafeRequestIdHeader(options.requestId.header)
        : "X-Request-ID";
    headers.set(header, requestId);
  }
  if (rateLimit && options.rateLimit && options.rateLimit.headers !== false) {
    const remaining = Math.max(0, rateLimit.limit - rateLimit.count);
    headers.set("RateLimit-Limit", String(rateLimit.limit));
    headers.set("RateLimit-Remaining", String(remaining));
    headers.set("RateLimit-Reset", String(Math.ceil(rateLimit.resetAt / 1000)));
    if (response.status === 429) {
      headers.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
      );
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function mergeSecurityOptions(
  global: SecurityOptions | undefined,
  local: SecurityOptions | false | undefined,
): SecurityOptions {
  if (local === false) {
    return {};
  }
  return {
    ...global,
    ...local,
    headers: local?.headers ?? global?.headers,
    rateLimit: local?.rateLimit ?? global?.rateLimit,
    requestId: local?.requestId ?? global?.requestId,
    sanitize: local?.sanitize ?? global?.sanitize,
  };
}
