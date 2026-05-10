import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { describe, expect, it } from "vitest";

describe("Framework .group() Tests", () => {
  it("should handle grouped routes with proper prefixing", async () => {
    const app = new Framework()
      .group("/products", (products) => {
        return products
          .get(
            "/",
            () => {
              return {
                products: [
                  { id: 1, name: "Product 1" },
                  { id: 2, name: "Product 2" },
                ],
              };
            },
            {
              response: h.object({
                products: h.array(
                  h.object({
                    id: h.number(),
                    name: h.string(),
                  }),
                ),
              }),
            },
          )
          .get(
            "/:id",
            (ctx) => {
              const productId = ctx.params.id;
              return {
                id: productId,
                name: `Product ${productId}`,
              };
            },
            {
              params: h.object({
                id: h.number().coerce(),
              }),
              response: h.object({
                id: h.number(),
                name: h.string(),
              }),
            },
          )
          .group("/categories", (categories) => {
            return categories.get(
              "/test",
              () => {
                return { categories: ["Electronics", "Clothing", "Books"] };
              },
              {
                response: h.object({
                  categories: h.array(h.string()),
                }),
              },
            );
          });
      })
      .listen(3016);

    const client = createClient<typeof app>("http://127.0.0.1:3016");

    const productsResponse = await client.products.get();
    expect(productsResponse.error).toBeNull();
    expect(productsResponse.data?.products).toHaveLength(2);
    expect(productsResponse.data?.products[0]?.name).toBe("Product 1");

    const productResponse = await client.products.id(1).get();
    expect(productResponse.error).toBeNull();
    expect(productResponse.data?.id).toBe(1);
    expect(productResponse.data?.name).toBe("Product 1");

    const categoriesResponse = await client.products.categories.test.get();
    expect(categoriesResponse.error).toBeNull();
    expect(categoriesResponse.data?.categories).toHaveLength(3);
    expect(categoriesResponse.data?.categories).toContain("Books");

    app.close();
  });

  it("should share middleware within groups", async () => {
    let middlewareExecutions = 0;

    const app = new Framework()
      .group("/api", (api) => {
        return api
          .onBeforeHandle(async (ctx: any, next) => {
            middlewareExecutions++;
            ctx.groupShared = "shared-value";
            return next();
          })
          .get("/resource1", (ctx: any) => {
            return { value: ctx.groupShared };
          })
          .get("/resource2", (ctx: any) => {
            return { value: ctx.groupShared };
          });
      })
      .listen(3017);

    const client = createClient<typeof app>("http://127.0.0.1:3017");

    const res1 = await client.api.resource1.get();
    expect(res1.data?.value).toBe("shared-value");

    const res2 = await client.api.resource2.get();
    expect(res2.data?.value).toBe("shared-value");

    expect(middlewareExecutions).toBe(2);

    app.close();
  });
});
