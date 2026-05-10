import { createClient } from "@hedystia/client";
import { z } from "@zod/mini";
import Framework from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .get(
    "/users/get",
    () => {
      return {
        status: "ok",
      };
    },
    {
      response: z.object({ status: z.literal("ok") }),
    },
  )
  .get(
    "/slug/:name",
    (context) => {
      return context.params;
    },
    {
      params: z.object({
        name: z.string(),
      }),
      response: z.object({ name: z.string() }),
    },
  )
  .get(
    "/test/test/new/random/:name/:id",
    (context) => {
      return context.params;
    },
    {
      params: z.object({
        id: z.coerce.number(),
        name: z.string(),
      }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
  )
  .listen(3022);

const client = createClient<typeof app>("http://127.0.0.1:3022");

describe("Test zod wrapper", () => {
  it("should return a response", async () => {
    const { data: slug } = await client.slug.name("sally").get();

    expect(slug).toEqual({ name: "sally" });
  });

  it("should return a response with params", async () => {
    const { data: test, error } = await client.test.test.new.random.name("sally").id(123).get();

    expect(error).toBeNull();

    expect(test).toEqual({ id: 123, name: "sally" });
  });

  it("should return a response for path ending in 'get'", async () => {
    const { error, data: response } = await client.users.get.get();

    expect(error).toBeNull();

    expect(response).toEqual({ status: "ok" });
  });

  afterAll(() => {
    app.close();
  });
});
