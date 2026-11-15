import { Readable, Writable } from "node:stream";
import { adapter } from "@hedystia/adapter";
import { describe, expect, it, vi } from "vitest";

function responseSink() {
  const chunks: Buffer[] = [];
  const headers: Record<string, string | string[]> = {};
  const sink = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    }),
    {
      statusCode: 0,
      setHeader(name: string, value: string | string[]) {
        headers[name] = value;
      },
    },
  );
  return { sink, chunks, headers };
}

describe("Node and Vercel transport fidelity", () => {
  it.each([
    "toNodeHandler",
    "toVercel",
  ] as const)("%s preserves an unread binary request stream", async (kind) => {
    const bytes = Buffer.from([0, 255, 1, 128]);
    const app = { fetch: async (request: Request) => new Response(await request.arrayBuffer()) };
    const request = Object.assign(Readable.from([bytes.subarray(0, 2), bytes.subarray(2)]), {
      method: "POST",
      url: "/upload",
      headers: { host: "example.test" },
    });
    const { sink, chunks } = responseSink();
    await adapter(app as any)[kind]()(request, sink);
    expect(sink.statusCode).toBe(200);
    expect(Buffer.concat(chunks)).toEqual(bytes);
  });

  it.each([
    false,
    0,
    "",
    "raw body",
    { value: 1 },
    null,
  ])("preserves parsed body %j", async (body) => {
    const app = { fetch: async (request: Request) => new Response(await request.text()) };
    const { sink, chunks } = responseSink();
    await adapter(app as any).toNodeHandler()(
      { method: "POST", url: "/", headers: {}, body },
      sink,
    );
    expect(Buffer.concat(chunks).toString()).toBe(
      typeof body === "string" ? body : JSON.stringify(body),
    );
  });

  it("delivers a chunk before the producer closes and retains separate Set-Cookie headers", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(next) {
        controller = next;
      },
    });
    const headers = new Headers();
    headers.append("set-cookie", "session=a; HttpOnly; Path=/");
    headers.append("set-cookie", "theme=dark; Expires=Thu, 01 Jan 2099 00:00:00 GMT");
    const app = { fetch: () => new Response(stream, { headers }) };
    const { sink, chunks, headers: received } = responseSink();
    const pending = adapter(app as any).toNodeHandler()(
      { method: "GET", url: "/", headers: {} },
      sink,
    );
    controller.enqueue(new TextEncoder().encode("data: first\n\n"));
    await vi.waitFor(() => expect(chunks.length).toBe(1));
    expect(sink.writableFinished).toBe(false);
    expect(received["set-cookie"]).toEqual(headers.getSetCookie());
    controller.close();
    await pending;
    expect(sink.writableFinished).toBe(true);
  });

  it("cancels the web producer when the response destination fails", async () => {
    const cancel = vi.fn();
    const app = {
      fetch: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1]));
            },
            cancel,
          }),
        ),
    };
    const { sink } = responseSink();
    sink._write = (_chunk, _encoding, done) => done(new Error("disconnected"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await adapter(app as any).toNodeHandler()({ method: "GET", url: "/", headers: {} }, sink);
      expect(cancel).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
