export type { DebugLevel } from "./debug";
export { createLogger } from "./debug";

export async function parseRequestBody(req: Request): Promise<any> {
  const contentType = (req.headers.get("Content-Type") || "").toLowerCase();

  if (!contentType) {
    return req.text();
  }

  if (contentType.includes("application/json")) {
    return await req.json();
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const obj: Record<string, any> = {};
    formData.forEach((value, key) => {
      if (obj[key]) {
        if (Array.isArray(obj[key])) {
          obj[key].push(value);
        } else {
          obj[key] = [obj[key], value];
        }
      } else {
        obj[key] = value;
      }
    });
    return obj;
  }
  return await req.text();
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
