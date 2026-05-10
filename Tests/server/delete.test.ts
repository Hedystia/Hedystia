import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .delete(
    "/resources/:id",
    (context) => {
      return {
        params: context.params,
        body: context.body,
        query: context.query,
      };
    },
    {
      params: h.object({
        id: h.number().coerce(),
      }),
      query: h.object({
        reason: h.optional(h.enum(["obsolete", "duplicate", "other"])),
      }),
      body: h.object({
        confirm: h.boolean(),
      }),
      response: h.object({
        params: h.object({ id: h.number() }),
        query: h.object({
          reason: h.optional(h.enum(["obsolete", "duplicate", "other"])),
        }),
        body: h.object({ confirm: h.boolean() }),
      }),
    },
  )
  .delete(
    "/resources/bulk",
    (context) => {
      return {
        query: context.query,
      };
    },
    {
      query: h.object({
        force: h.optional(h.boolean()),
      }),
      response: h.object({
        body: h.array(h.number()),
        query: h.object({ force: h.optional(h.boolean()) }),
      }),
    },
  )
  .listen(3005);

const client = createClient<typeof app>("http://127.0.0.1:3005");

describe("Test DELETE method", () => {
  it("should handle DELETE with params, body and query", async () => {
    const { data: response, error } = await client.resources.id(456).delete({
      body: {
        confirm: true,
      },
      query: {
        reason: "obsolete",
      },
    });

    expect(error).toBeNull();
    expect(response).toEqual({
      params: { id: 456 },
      body: { confirm: true },
      query: { reason: "obsolete" },
    });
  });

  it("should handle DELETE with only required body", async () => {
    const { data: response, error } = await client.resources.id(789).delete({
      body: {
        confirm: true,
      },
    });

    expect(error).toBeNull();
    expect(response).toEqual({
      params: { id: 789 },
      body: { confirm: true },
      query: {},
    });
  });

  it("should validate DELETE parameters - invalid query", async () => {
    const { error } = await client.resources
      .id(123)
      .delete({ body: { confirm: true }, query: { reason: "invalid" as any } });

    expect(error).toBeDefined();
  });

  it("should validate DELETE parameters - invalid body type", async () => {
    const { error } = await client.resources.bulk.delete("not-an-array" as any);

    expect(error).toBeDefined();
  });

  it("should return error when required body is missing", async () => {
    const { error } = await client.resources.id(999).delete({
      body: undefined as any,
    });

    expect(error).toBeDefined();
  });

  afterAll(() => {
    app.close();
  });
});
