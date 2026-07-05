import { createClient } from "@hedystia/client";
import Framework from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .get("/stream-text", async (ctx) => {
    ctx.stream.write("line1\n");
    ctx.stream.write("line2\n");
    ctx.stream.write("line3\n");
    ctx.stream.end();
  })
  .get("/stream-readable", () => {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("chunk A "));
        controller.enqueue(encoder.encode("chunk B"));
        controller.close();
      },
    });
  })
  .listen(3025);

const client = createClient<typeof app>("http://localhost:3025");

describe("Test client stream", () => {
  it("should consume a stream response using the stream format", async () => {
    const { data, error } = await client["stream-text"].get({
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
    expect(result).toBe("line1\nline2\nline3\n");
  });

  it("should consume a ReadableStream response", async () => {
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
    expect(result).toBe("chunk A chunk B");
  });

  afterAll(() => {
    app.close();
  });
});
