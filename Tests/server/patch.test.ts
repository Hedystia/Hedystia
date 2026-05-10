import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .patch(
    "/resources/:id",
    (context) => {
      return {
        params: context.params,
        body: context.body,
      };
    },
    {
      params: h.object({
        id: h.number().coerce(),
      }),
      body: h.object({
        title: h.string(),
        content: h.string(),
        published: h.optional(h.boolean()),
      }),
      response: h.object({
        params: h.object({ id: h.number() }),
        body: h.object({
          title: h.string(),
          content: h.string(),
          published: h.optional(h.boolean()),
        }),
      }),
    },
  )
  .patch(
    "/resources/status/:id",
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
        notify: h.optional(h.enum(["yes", "no"])),
      }),
      body: h.object({
        status: h.enum(["draft", "published", "archived"]),
      }),
      response: h.object({
        params: h.object({ id: h.number() }),
        query: h.object({ notify: h.optional(h.enum(["yes", "no"])) }),
        body: h.object({
          status: h.enum(["draft", "published", "archived"]),
        }),
      }),
    },
  )
  .patch(
    "/resources",
    (context) => {
      return {
        body: context.body,
      };
    },
    {
      body: h.array(
        h.object({
          id: h.number(),
          title: h.string(),
        }),
      ),
      response: h.object({
        body: h.array(
          h.object({
            id: h.number(),
            title: h.string(),
          }),
        ),
      }),
    },
  )
  .listen(3006);

const client = createClient<typeof app>("http://127.0.0.1:3006");

describe("Test PATCH method", () => {
  it("should handle PATCH with params and body", async () => {
    const { data: response } = await client.resources.id(123).patch({
      body: {
        title: "Updated Resource",
        content: "This resource has been updated",
        published: true,
      },
    });

    expect(response).toEqual({
      params: { id: 123 },
      body: {
        title: "Updated Resource",
        content: "This resource has been updated",
        published: true,
      },
    });
  });

  it("should handle PATCH with nested route", async () => {
    client.resources.id;
    const { data: response } = await client.resources.status.id(456).patch({
      body: { status: "published" },
      query: { notify: "yes" },
    });

    expect(response).toEqual({
      params: { id: 456 },
      query: { notify: "yes" },
      body: { status: "published" },
    });
  });

  it("should handle PATCH with array body", async () => {
    const { data: response } = await client.resources.patch({
      body: [
        { id: 1, title: "First Resource" },
        { id: 2, title: "Second Resource" },
      ],
    });

    expect(response).toEqual({
      body: [
        { id: 1, title: "First Resource" },
        { id: 2, title: "Second Resource" },
      ],
    });
  });

  it("should validate body in PATCH requests", async () => {
    try {
      await client.resources.status.id(789).patch({
        body: { status: "invalid-status" as any },
      });

      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  afterAll(() => {
    app.close();
  });
});
