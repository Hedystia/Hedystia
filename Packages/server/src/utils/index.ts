import { SecurityInputError } from "../security";

export type { DebugLevel } from "./debug";
export { createLogger } from "./debug";

async function readLimitedBytes(req: Request, maxBytes: number): Promise<Uint8Array> {
  const reader = req.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new SecurityInputError("Request body exceeds the maximum allowed size", 413);
    }
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SecurityInputError("Request body exceeds the maximum allowed size", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readLimitedText(req: Request, maxBytes?: number): Promise<string> {
  if (maxBytes === undefined) {
    return await req.text();
  }
  return new TextDecoder().decode(await readLimitedBytes(req, maxBytes));
}

export async function limitRequestBody(req: Request, maxBytes: number): Promise<Request> {
  const bytes = await readLimitedBytes(req.clone(), maxBytes);
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  return new Request(req.url, {
    body: bytes,
    headers,
    method: req.method,
  });
}

export async function parseRequestBody(req: Request, maxBytes?: number): Promise<any> {
  const contentType = (req.headers.get("Content-Type") || "").toLowerCase();
  const contentLength = req.headers.get("content-length");
  if (maxBytes !== undefined && contentLength && Number(contentLength) > maxBytes) {
    throw new SecurityInputError("Request body exceeds the maximum allowed size");
  }

  if (!contentType) {
    return readLimitedText(req, maxBytes);
  }

  if (contentType.includes("application/json")) {
    const text = await readLimitedText(req, maxBytes);
    return text === "" ? undefined : JSON.parse(text);
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await readLimitedText(req, maxBytes);
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
  if (contentType.includes("multipart/form-data")) {
    if (maxBytes === undefined) {
      return await req.formData();
    }
    const bytes = await readLimitedBytes(req, maxBytes);
    const limitedRequest = new Request(req.url, {
      body: bytes,
      headers: (() => {
        const headers = new Headers(req.headers);
        headers.delete("content-length");
        return headers;
      })(),
      method: req.method,
    });
    return await limitedRequest.formData();
  }
  return await readLimitedText(req, maxBytes);
}

export function isBunHTMLBundle(obj: any): obj is { index: string } {
  return (
    obj &&
    typeof obj === "object" &&
    "index" in obj &&
    typeof (obj as any).index === "string" &&
    (obj as any).index.endsWith(".html")
  );
}

export function determineContentType(body: any): string {
  if (typeof body === "string") {
    const trimmed = body.trimStart();
    if (
      trimmed.startsWith("<") &&
      (trimmed.toLowerCase().startsWith("<!doctype html") ||
        trimmed.toLowerCase().startsWith("<html") ||
        trimmed.toLowerCase().startsWith("<head") ||
        trimmed.toLowerCase().startsWith("<body") ||
        trimmed.toLowerCase().startsWith("<div") ||
        trimmed.toLowerCase().startsWith("<script"))
    ) {
      return "text/html";
    }
    if (trimmed.startsWith("<?xml") || trimmed.startsWith("<rss") || trimmed.startsWith("<svg")) {
      return "application/xml";
    }
    return "text/plain";
  }
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
    return "application/octet-stream";
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return body.type || "application/octet-stream";
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return "multipart/form-data";
  }
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return "application/x-www-form-urlencoded";
  }
  return "application/json";
}
