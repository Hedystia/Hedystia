import { createClient } from "@hedystia/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const routes = [] as any;

describe("client request regressions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("honors explicit response formats even when the body is text", async () => {
    const payloads = [
      new Response("abc", { headers: { "Content-Type": "text/plain" } }),
      new Response("abc", { headers: { "Content-Type": "text/plain" } }),
      new Response("abc", { headers: { "Content-Type": "text/html" } }),
      new Response("a=1&b=2", { headers: { "Content-Type": "text/plain" } }),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => payloads.shift()!);
    const client = createClient<typeof routes>("https://api.example.test");

    const bytes = await (client as any).data.get({ responseFormat: "bytes" });
    expect(Array.from(bytes.data as Uint8Array)).toEqual([97, 98, 99]);

    const buffer = await (client as any).data.get({ responseFormat: "arrayBuffer" });
    expect(new TextDecoder().decode(buffer.data as ArrayBuffer)).toBe("abc");

    const blob = await (client as any).data.get({ responseFormat: "blob" });
    expect(await (blob.data as Blob).text()).toBe("abc");

    const form = await (client as any).data.get({ responseFormat: "formData" });
    expect((form.data as FormData).get("a")).toBe("1");
    expect((form.data as FormData).get("b")).toBe("2");
  });

  it("sets a JSON content type for falsy bodies that are still sent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createClient<typeof routes>("https://api.example.test");

    await (client as any).counters.post({ body: 0 });

    const [, init] = fetchMock.mock.calls[0]!;
    const request = new Request("https://api.example.test", init);
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(await request.text()).toBe("0");
  });
});
