import { swagger } from "@hedystia/swagger";
import Framework, { h } from "hedystia";
import { describe, expect, it } from "vitest";

describe("Swagger Plugin", () => {
  it("should register / and /json endpoints", async () => {
    const app = new Framework().get("/hello", () => "world", {
      description: "Say hello",
      tags: ["Greeting"],
    });

    const { plugin } = swagger({
      title: "Test API",
      version: "1.0.0",
      host: "http://localhost",
    });

    app.use("/swagger", plugin(app));

    // Test /swagger
    const resRoot = await app.fetch(new Request("http://localhost/swagger"));
    expect(resRoot.status).toBe(200);
    const html = await resRoot.text();
    expect(html).toContain("<html");
    expect(html).toContain("Test API");

    // Test /swagger/json
    const resJson = await app.fetch(new Request("http://localhost/swagger/json"));
    expect(resJson.status).toBe(200);
    const spec = (await resJson.json()) as any;
    expect(spec.info.title).toBe("Test API");
    expect(spec.info.version).toBe("1.0.0");
    expect(spec.paths["/hello"]).toBeDefined();
    expect(spec.paths["/hello"].get.summary).toBe("Say hello");
    expect(spec.paths["/hello"].get.tags).toContain("Greeting");
  });

  it("should correctly handle path parameters and schemas", async () => {
    const app = new Framework().post("/user/:id", (ctx) => ({ id: ctx.params.id }), {
      params: h.object({
        id: h.string(),
      }),
      body: h.object({
        name: h.string(),
      }),
      response: h.object({
        id: h.string(),
      }),
      description: "Update user",
      tags: ["User"],
    });

    const { swagger: swaggerInstance, plugin } = swagger();
    app.use("/swagger", plugin(app));

    const spec = swaggerInstance.getSpec() as any;

    // OpenAPI 3.0.0 uses {id} for path parameters
    expect(spec.paths["/user/{id}"]).toBeDefined();
    const postOp = spec.paths["/user/{id}"].post;
    expect(postOp).toBeDefined();
    expect(postOp.summary).toBe("Update user");
    expect(postOp.tags).toContain("User");

    // Parameters
    expect(postOp.parameters).toBeDefined();
    expect(postOp.parameters.find((p: any) => p.name === "id" && p.in === "path")).toBeDefined();

    // Request Body
    expect(postOp.requestBody).toBeDefined();
    expect(postOp.requestBody.content["application/json"].schema).toBeDefined();

    // Response
    expect(postOp.responses["200"]).toBeDefined();
    expect(postOp.responses["200"].content["application/json"].schema).toBeDefined();
  });

  it("should handle static routes", async () => {
    const app = new Framework().static("/static-test", { message: "static" });

    const { swagger: swaggerInstance, plugin } = swagger();
    app.use("/swagger", plugin(app));

    const spec = swaggerInstance.getSpec() as any;
    expect(spec.paths["/static-test"]).toBeDefined();
    expect(spec.paths["/static-test"].get).toBeDefined();
    expect(spec.paths["/static-test"].get.summary).toContain("Static route");
  });

  it("should handle WebSocket and Subscription routes", async () => {
    const app = new Framework()
      .ws("/ws", {
        message: (ws, message) => {
          ws.send(message);
        },
      })
      .subscription(
        "/sub",
        (_ctx) => {
          return { initial: "data" };
        },
        {
          params: h.object({ id: h.string() }),
          summary: "Test subscription",
        },
      );

    const { swagger: swaggerInstance, plugin } = swagger();
    app.use("/swagger", plugin(app));

    const spec = swaggerInstance.getSpec() as any;

    expect(spec.paths["/ws"]).toBeDefined();
    expect(spec.paths["/ws"].ws).toBeDefined();

    expect(spec.paths["/sub"]).toBeDefined();
    expect(spec.paths["/sub"].sub).toBeDefined();
    expect(spec.paths["/sub"].sub.summary).toBe("Test subscription");
  });

  it("should validate spec using validate method", async () => {
    const { swagger: swaggerInstance } = swagger();
    swaggerInstance.addRoute("GET", "/test", { response: h.object({ ok: h.boolean() }) });

    const isValid = await swaggerInstance.validate();
    // @apidevtools/swagger-parser should be able to validate this basic spec
    expect(isValid).toBe(true);
  });
});
