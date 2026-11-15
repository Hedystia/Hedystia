import { swagger } from "@hedystia/swagger";
import Framework, { h } from "hedystia";
import { describe, expect, it } from "vitest";

describe("OpenAPI contract generation", () => {
  it("documents custom request headers and respects OpenAPI reserved names", async () => {
    const app = new Framework().get("/private", () => "ok", {
      headers: h.object({
        "x-api-key": h.string(),
        "x-trace-id": h.string().optional(),
        Authorization: h.string(),
        Accept: h.string(),
        "Content-Type": h.string(),
      }),
    });
    const registered = swagger();
    registered.plugin(app);
    const parameters = (registered.swagger.getSpec() as any).paths["/private"].get.parameters;
    expect(parameters).toEqual([
      expect.objectContaining({ name: "x-api-key", in: "header", required: true }),
      expect.objectContaining({ name: "x-trace-id", in: "header", required: false }),
    ]);
    expect(await registered.swagger.validate()).toBe(true);
  });

  it("preserves metadata and separates path, query, body, and response schemas", async () => {
    const app = new Framework()
      .get("/accounts/:id", () => ({ id: "a-1", active: true }), {
        params: h.object({ id: h.string() }),
        query: h.object({ include: h.optional(h.boolean()) }),
        response: h.object({ id: h.string(), active: h.boolean() }),
        description: "Read an account",
        tags: ["Accounts"],
      })
      .post("/accounts", () => ({ id: "a-2" }), {
        body: h.object({ email: h.email(), roles: h.array(h.string()) }),
        response: h.object({ id: h.string() }),
      })
      .ws("/events", { message: (ws, message) => ws.send(message) })
      .subscription("/updates", () => ({ ok: true }), { summary: "Live updates" });

    const registered = swagger({
      title: "Accounts API",
      version: "9.1.0",
      tags: [{ name: "Accounts", description: "Account operations" }],
      externalDocs: { description: "Guide", url: "https://docs.example.test" },
    });
    // Register through the public plugin factory so route traversal is covered.
    registered.plugin(app);
    const spec = registered.swagger.getSpec() as any;

    expect(spec.info).toMatchObject({ title: "Accounts API", version: "9.1.0" });
    expect(spec.tags).toEqual([{ name: "Accounts", description: "Account operations" }]);
    expect(spec.externalDocs).toEqual({
      description: "Guide",
      url: "https://docs.example.test",
    });
    expect(spec.paths["/accounts/{id}"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "id", in: "path", required: true }),
        expect.objectContaining({ name: "include", in: "query", required: false }),
      ]),
    );
    expect(
      spec.paths["/accounts"].post.requestBody.content["application/json"].schema,
    ).toMatchObject({
      type: "object",
      required: ["email", "roles"],
    });
    expect(spec.paths["/events"]["x-hedystia-websocket"]).toBeDefined();
    expect(spec.paths["/updates"]["x-hedystia-subscription"].summary).toBe("Live updates");
    expect(await registered.swagger.validate()).toBe(true);
  });
});
