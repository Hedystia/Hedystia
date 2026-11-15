import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { describe, expect, it, vi } from "vitest";

type Transport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const rootApp = new Framework().get("/", () => ({ ok: true }));

describe("client request control", () => {
  it("cancels an in-flight transport when the caller aborts", async () => {
    const controller = new AbortController();
    const transport: Transport = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    const client = createClient<typeof rootApp>("https://example.test", { fetch: transport });
    const pending = client.get({ signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({
      status: 0,
      ok: false,
      data: null,
      error: controller.signal.reason,
    });
  });

  it("uses the global fetch when no custom transport is configured", async () => {
    const transport = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ native: true }));
    try {
      const client = createClient<typeof rootApp>("https://example.test");
      expect(await client.get()).toMatchObject({ data: { native: true }, ok: true });
      expect(transport).toHaveBeenCalledOnce();
    } finally {
      transport.mockRestore();
    }
  });

  it("runs a typed client against an in-memory app without opening a port", async () => {
    const app = new Framework().post("/echo", ({ body }) => body, {
      body: h.object({ text: h.string() }),
    });
    const transport: Transport = (input, init) =>
      Promise.resolve(app.fetch(new Request(input, init)));
    const client = createClient<typeof app>("https://example.test", { fetch: transport });
    expect(await client.echo.post({ body: { text: "hello" } })).toMatchObject({
      data: { text: "hello" },
      status: 200,
      ok: true,
      error: null,
    });
  });

  it("passes the caller's cancellation signal and preserves abort errors", async () => {
    const controller = new AbortController();
    const reason = new Error("user cancelled");
    controller.abort(reason);
    const transport = vi.fn<Transport>(async (_input, init) => {
      init?.signal?.throwIfAborted();
      return Response.json({ ok: true });
    });
    const client = createClient<typeof rootApp>("https://example.test", { fetch: transport });
    const result = await client.get({ signal: controller.signal });
    expect(transport.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    expect(result).toEqual({ data: null, error: reason, status: 0, ok: false });
  });

  it.each([
    "a/b",
    "a?admin=true",
    "a#fragment",
    "100%",
    "雪 & café",
  ])("keeps dynamic parameter %s inside one URL segment", async (id) => {
    const transport = vi.fn<Transport>(async () => Response.json({ ok: true }));
    const app = new Framework().get("/users/:id", ({ params }) => ({ id: params.id }), {
      params: h.object({ id: h.string() }),
    });
    const client = createClient<typeof app>("https://example.test", { fetch: transport });
    await client.users.id(id).get();
    expect(transport.mock.calls[0]?.[0]).toBe(
      `https://example.test/users/${encodeURIComponent(id)}`,
    );
  });

  it("keeps HTTP errors separate from transport failures", async () => {
    const client = createClient<typeof rootApp>("https://example.test", {
      fetch: async () => Response.json({ message: "denied" }, { status: 403 }),
    });
    expect(await client.get()).toEqual({
      data: null,
      error: { message: "denied" },
      status: 403,
      ok: false,
    });
  });
});
