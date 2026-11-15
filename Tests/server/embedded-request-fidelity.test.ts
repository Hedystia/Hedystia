import Framework from "hedystia";
import { describe, expect, it } from "vitest";

describe("embedded route test request fidelity", () => {
  it.each([false, 0, "", null])("uses JSON for falsy body %j", async (body) => {
    const app = new Framework().post(
      "/echo",
      ({ req, rawBody }) => ({
        type: req.headers.get("content-type"),
        body: rawBody,
      }),
      {
        test: async ({ createRequest, expect: assert }) => {
          const { response } = await createRequest({ body });
          assert(response.type).toBe("application/json");
          assert(response.body).toBe(JSON.stringify(body));
        },
      },
    );
    expect(await app.runTests()).toMatchObject({ passed: 1, failed: 0 });
  });
  it("encodes parameters independently without replacing similar parameter names", async () => {
    const app = new Framework().get("/:id2/:id", ({ req }) => new URL(req.url).pathname, {
      test: async ({ createRequest, expect: assert }) => {
        const { response } = await createRequest({ params: { id: "a?b#c", id2: "other" } });
        assert(response).toBe("/other/a%3Fb%23c");
      },
    });
    expect(await app.runTests()).toMatchObject({ passed: 1, failed: 0 });
  });
});
