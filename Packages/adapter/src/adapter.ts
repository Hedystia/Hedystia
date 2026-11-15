import type { Hedystia, MacroData, RouteDefinition } from "hedystia";

interface AdapterOptions {
  prefix?: string;
}

export class HedystiaAdapter<Routes extends RouteDefinition[] = [], Macros extends MacroData = {}> {
  private app: Hedystia<Routes, Macros>;

  /**
   * Create new instance of Hedystia adapter
   * @param {Hedystia<Routes, Macros>} app - Hedystia instance
   */
  constructor(app: Hedystia<Routes, Macros>) {
    this.app = app;
  }

  /**
   * Create Cloudflare Worker adapter
   * @param {AdapterOptions} [options] - Adapter configuration
   * @returns Cloudflare Worker adapter
   */
  toCloudflareWorker(options: AdapterOptions = {}) {
    const prefix = options.prefix || "";

    return {
      fetch: async (request: Request, _env: any, _ctx: any) => {
        if (prefix) {
          const url = new URL(request.url);
          url.pathname = prefix + url.pathname;
          const newRequest = new Request(url.toString(), request);
          return this.app.fetch(newRequest);
        }
        return this.app.fetch(request);
      },
    };
  }

  /**
   * Create Node.js handler adapter
   * @param {AdapterOptions} [options] - Adapter configuration
   * @returns Node.js handler adapter
   */
  toNodeHandler(options: AdapterOptions = {}) {
    const prefix = options.prefix || "";

    return async (req: any, res: any) => {
      try {
        const request = await this.nodeToRequest(req, prefix);
        const response = await this.app.fetch(request);
        await this.responseToNode(response, res);
      } catch (error) {
        console.error("Server error:", error);
        if (res.headersSent) {
          res.destroy(error);
        } else {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain");
          res.end("Internal Server Error");
        }
      }
    };
  }

  /**
   * Create Fastly Compute adapter
   * @param {AdapterOptions} [options] - Adapter configuration
   * @returns Fastly Compute adapter
   */
  toFastlyCompute(options: AdapterOptions = {}) {
    const prefix = options.prefix || "";

    return async (request: Request) => {
      try {
        if (prefix) {
          const url = new URL(request.url);
          url.pathname = prefix + url.pathname;
          const newRequest = new Request(url.toString(), request);
          return await this.app.fetch(newRequest);
        }
        return await this.app.fetch(request);
      } catch (error) {
        console.error("Server error:", error);
        return new Response(`Internal Server Error: ${(error as Error).message}`, { status: 500 });
      }
    };
  }

  /**
   * Create Deno adapter
   * @param {AdapterOptions} [options] - Adapter configuration
   * @returns Deno adapter
   */
  toDeno(options: AdapterOptions = {}) {
    const prefix = options.prefix || "";
    return async (request: Request) => {
      try {
        if (prefix) {
          const url = new URL(request.url);
          url.pathname = prefix + url.pathname;
          const newRequest = new Request(url.toString(), request);
          return await this.app.fetch(newRequest);
        }
        return await this.app.fetch(request);
      } catch (error) {
        console.error("Server error:", error);
        return new Response(`Internal Server Error: ${(error as Error).message}`, { status: 500 });
      }
    };
  }

  /**
   * Create AWS Lambda adapter
   * @param {AdapterOptions} [options] - Adapter configuration
   * @returns AWS Lambda adapter
   */
  toLambda(options: AdapterOptions = {}) {
    const prefix = options.prefix || "";

    return async (event: any, _context: any) => {
      try {
        const request = this.lambdaToRequest(event, prefix);
        const response = await this.app.fetch(request);
        return this.responseToLambda(response);
      } catch (error) {
        console.error("Server error:", error);
        return {
          statusCode: 500,
          body: `Internal Server Error: ${(error as Error).message}`,
          headers: { "Content-Type": "text/plain" },
        };
      }
    };
  }

  /**
   * Create Vercel adapter
   * @param {AdapterOptions} [options] - Adapter configuration
   * @returns Vercel adapter
   */
  toVercel(options: AdapterOptions = {}) {
    const prefix = options.prefix || "";

    return async (req: any, res: any) => {
      try {
        const request = await this.vercelToRequest(req, prefix);
        const response = await this.app.fetch(request);
        await this.responseToNode(response, res);
      } catch (error) {
        console.error("Server error:", error);
        if (res.headersSent) {
          res.destroy(error);
        } else {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain");
          res.end("Internal Server Error");
        }
      }
    };
  }

  private vercelToRequest(req: any, prefix: string): Promise<Request> {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    return this.nodeToRequest(req, prefix, `${protocol}://${host}`);
  }

  private async nodeToRequest(req: any, prefix: string, origin?: string): Promise<Request> {
    const url = new URL(prefix + req.url, origin ?? `http://${req.headers.host || "localhost"}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else if (value !== undefined) {
        headers.set(key, String(value));
      }
    }

    let body: BodyInit | null = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (req.body !== undefined) {
        body =
          typeof req.body === "string" || req.body instanceof Uint8Array
            ? req.body
            : JSON.stringify(req.body);
      } else if (typeof req[Symbol.asyncIterator] === "function") {
        const { Readable } = await import("node:stream");
        body = Readable.toWeb(req) as ReadableStream;
      }
    }

    return new Request(url.toString(), {
      method: req.method,
      headers,
      body,
      ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
    });
  }

  private async responseToNode(response: Response, res: any) {
    res.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) {
      if (key !== "set-cookie") {
        res.setHeader(key, value);
      }
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length) {
      res.setHeader("set-cookie", cookies);
    }
    if (response.body && typeof res.write === "function") {
      const { Readable } = await import("node:stream");
      const { pipeline } = await import("node:stream/promises");
      await pipeline(Readable.fromWeb(response.body as any), res);
    } else {
      res.end(Buffer.from(await response.arrayBuffer()));
    }
  }

  private lambdaToRequest(event: any, prefix: string): Request {
    const url = new URL(
      prefix + (event.rawPath || event.path),
      `${event.headers?.["x-forwarded-proto"] || "https"}://${event.headers?.host}`,
    );

    if (event.queryStringParameters) {
      for (const [key, value] of Object.entries(event.queryStringParameters)) {
        url.searchParams.append(key, String(value));
      }
    }

    const headers = new Headers();
    if (event.headers) {
      for (const [key, value] of Object.entries(event.headers)) {
        headers.set(key, String(value));
      }
    }

    const body = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;

    return new Request(url.toString(), {
      method: event.requestContext?.http?.method || event.httpMethod,
      headers,
      body: body || undefined,
    });
  }

  private async responseToLambda(response: Response) {
    const headers: Record<string, string> = {};
    for (const [key, value] of response.headers) {
      headers[key] = value;
    }

    const bodyBuffer = await response.arrayBuffer();
    const isBase64Encoded = this.isBinary(response.headers.get("content-type"));

    return {
      statusCode: response.status,
      headers,
      body: Buffer.from(bodyBuffer).toString(isBase64Encoded ? "base64" : "utf8"),
      isBase64Encoded,
    };
  }

  private isBinary(contentType: string | null): boolean {
    if (!contentType) {
      return false;
    }
    return /^(image|audio|video|application\/octet-stream|application\/pdf|application\/zip)/.test(
      contentType,
    );
  }
}

/**
 * Create Hedystia adapter
 * @param {Hedystia<Routes, Macros>} app - Hedystia instance
 * @returns {HedystiaAdapter<Routes, Macros>} Adapter instance
 */
export function adapter<Routes extends RouteDefinition[] = [], Macros extends MacroData = {}>(
  app: Hedystia<Routes, Macros>,
): HedystiaAdapter<Routes, Macros> {
  return new HedystiaAdapter(app);
}
