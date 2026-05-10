import fs from "node:fs";
import path from "node:path";
import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const staticHtml = fs.readFileSync(path.join(__dirname, "static.html"), "utf-8");

const app = new Framework()
  .get(
    "/dynamic",
    () => {
      return {
        type: "dynamic",
      };
    },
    {
      response: h.object({ type: h.literal("dynamic") }),
    },
  )
  .static(
    "/static-json",
    { type: "static" },
    {
      response: h.object({ type: h.literal("static") }),
    },
  )
  .static("/static-text", "Static text content", {
    response: h.string(),
  })
  .static("/static-html", staticHtml)
  .listen(3020);

const client = createClient<typeof app>("http://127.0.0.1:3020");

describe("Test static routes", () => {
  it("should return dynamic route content", async () => {
    const { data } = await client.dynamic.get();

    expect(data).toEqual({ type: "dynamic" });
  });

  it("should return static JSON content", async () => {
    const { data } = await client["static-json"].get();

    expect(data).toEqual({ type: "static" });
  });

  it("should return static text content", async () => {
    const { data } = await client["static-text"].get();

    expect(data).toBe("Static text content");
  });

  it("should return static HTML content", async () => {
    const { error, data } = await client["static-html"].get();

    expect(error).toBeNull();
    expect(data).toContain("<h1>Static HTML</h1>");
  });

  it("should return 404 for undefined routes", async () => {
    const response = await fetch("http://127.0.0.1:3020/undefined-route");

    expect(response.status).toBe(404);
  });

  afterAll(() => {
    app.close();
  });
});
