import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .get(
    "/stream-ctx",
    async (ctx) => {
      ctx.stream.write("Hello ");
      ctx.stream.write("World");
      ctx.stream.end();
    },
    {
      response: h.any(),
    },
  )
  .get(
    "/stream-readable",
    () => {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("Hello "));
          controller.enqueue(encoder.encode("World"));
          controller.close();
        },
      });
    },
    {
      response: h.any(),
    },
  )
  .get(
    "/stream-chunks",
    async (ctx) => {
      ctx.stream.write("chunk1\n");
      ctx.stream.write("chunk2\n");
      ctx.stream.write("chunk3\n");
      ctx.stream.end();
    },
    {
      response: h.any(),
    },
  )
  .listen(3018);

const client = createClient<typeof app>("http://localhost:3018");

describe("Test server stream", () => {
  it("should stream using ctx.stream", async () => {
    const res = await fetch("http://localhost:3018/stream-ctx");
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toBe("text/plain");
    const text = await res.text();
    expect(text).toBe("Hello World");
  });

  it("should stream using ReadableStream directly", async () => {
    const res = await fetch("http://localhost:3018/stream-readable");
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe("Hello World");
  });

  it("should stream multiple chunks via ctx.stream", async () => {
    const res = await fetch("http://localhost:3018/stream-chunks");
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe("chunk1\nchunk2\nchunk3\n");
  });

  it("should receive stream data through client with stream format", async () => {
    const { data, error } = await client["stream-readable"].get({
      responseFormat: "stream",
    });
    expect(error).toBeNull();
    expect(data).toBeInstanceOf(ReadableStream);
    const reader = (data as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    expect(result).toBe("Hello World");
  });

  afterAll(() => {
    app.close();
  });
});
