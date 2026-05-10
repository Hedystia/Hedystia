import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const commentsRouter = new Framework().group("/:postId/comments", (app) =>
  app
    .get(
      "/",
      (ctx) => {
        return {
          postId: ctx.params.postId,
          comments: [{ id: 1, text: "Comment 1" }],
        };
      },
      {
        params: h.object({
          postId: h.string(),
        }),
        response: h.object({
          postId: h.string(),
          comments: h.array(
            h.object({
              id: h.number(),
              text: h.string(),
            }),
          ),
        }),
      },
    )
    .post(
      "/",
      (ctx) => {
        return {
          postId: ctx.params.postId,
          created: true,
        };
      },
      {
        params: h.object({
          postId: h.string(),
        }),
        response: h.object({
          postId: h.string(),
          created: h.boolean(),
        }),
      },
    ),
);

const subscriptionsRouter = new Framework().group("/:postId/subscriptions", (app) =>
  app.post(
    "/",
    (ctx) => {
      return {
        postId: ctx.params.postId,
        subscribed: true,
      };
    },
    {
      params: h.object({
        postId: h.string(),
      }),
      response: h.object({
        postId: h.string(),
        subscribed: h.boolean(),
      }),
    },
  ),
);

const votesRouter = new Framework().group("/:postId/vote", (app) =>
  app
    .post(
      "/",
      (ctx) => {
        return {
          postId: ctx.params.postId,
          voted: true,
        };
      },
      {
        params: h.object({
          postId: h.string(),
        }),
        response: h.object({
          postId: h.string(),
          voted: h.boolean(),
        }),
      },
    )
    .delete(
      "/",
      (ctx) => {
        return {
          postId: ctx.params.postId,
          unvoted: true,
        };
      },
      {
        params: h.object({
          postId: h.string(),
        }),
        response: h.object({
          postId: h.string(),
          unvoted: h.boolean(),
        }),
      },
    ),
);

const postsRouter = new Framework().group("/posts", (app) =>
  app
    .use(commentsRouter)
    .use(subscriptionsRouter)
    .use(votesRouter)
    .get(
      "/",
      () => {
        return {
          posts: [
            { id: "post-1", title: "Post 1" },
            { id: "post-2", title: "Post 2" },
          ],
        };
      },
      {
        response: h.object({
          posts: h.array(
            h.object({
              id: h.string(),
              title: h.string(),
            }),
          ),
        }),
      },
    )
    .post(
      "/",
      (ctx) => {
        return {
          id: "new-post-id",
          title: ctx.body.title,
        };
      },
      {
        body: h.object({
          title: h.string(),
        }),
        response: h.object({
          id: h.string(),
          title: h.string(),
        }),
      },
    )
    .get(
      "/:id",
      (ctx) => {
        return {
          id: ctx.params.id,
          title: `Post ${ctx.params.id}`,
        };
      },
      {
        params: h.object({
          id: h.string(),
        }),
        response: h.object({
          id: h.string(),
          title: h.string(),
        }),
      },
    )
    .delete(
      "/:id",
      (ctx) => {
        return {
          id: ctx.params.id,
          deleted: true,
        };
      },
      {
        params: h.object({
          id: h.string(),
        }),
        response: h.object({
          id: h.string(),
          deleted: h.boolean(),
        }),
      },
    ),
);

const app = new Framework().group("/api", (app) => app.use(postsRouter)).listen(3034);

const client = createClient<typeof app>("http://127.0.0.1:3034");

describe("Framework Routes Mounting Order Tests", () => {
  it("should list all posts", async () => {
    const { data, error } = await client.api.posts.get();
    expect(error).toBeNull();
    expect(data?.posts).toHaveLength(2);
  });

  it("should create a post", async () => {
    const { data, ok } = await client.api.posts.post({
      body: { title: "New Post" },
    });
    expect(ok).toBe(true);
    expect(data?.id).toBe("new-post-id");
  });

  it("should get a specific post", async () => {
    const { data, ok } = await client.api.posts.id("test-post-123").get();
    expect(ok).toBe(true);
    expect(data?.id).toBe("test-post-123");
  });

  it("should delete a specific post", async () => {
    const { data, ok } = await client.api.posts.id("test-post-123").delete();
    expect(ok).toBe(true);
    expect(data?.deleted).toBe(true);
  });

  it("should get comments for a post", async () => {
    const { data, ok } = await client.api.posts.postId("test-post-id").comments.get();
    expect(ok).toBe(true);
    expect(data?.postId).toBe("test-post-id");
    expect(data?.comments).toBeDefined();
  });

  it("should create a comment for a post", async () => {
    const { data, ok } = await client.api.posts.postId("test-post-id").comments.post();
    expect(ok).toBe(true);
    expect(data?.postId).toBe("test-post-id");
    expect(data?.created).toBe(true);
  });

  it("should subscribe to a post", async () => {
    const { data, ok } = await client.api.posts.postId("test-post-id").subscriptions.post();
    expect(ok).toBe(true);
    expect(data?.postId).toBe("test-post-id");
    expect(data?.subscribed).toBe(true);
  });

  it("should vote on a post", async () => {
    const { data, ok } = await client.api.posts.postId("test-post-id").vote.post();
    expect(ok).toBe(true);
    expect(data?.postId).toBe("test-post-id");
    expect(data?.voted).toBe(true);
  });

  it("should remove vote from a post", async () => {
    const { data, ok } = await client.api.posts.postId("test-post-id").vote.delete();
    expect(ok).toBe(true);
    expect(data?.postId).toBe("test-post-id");
    expect(data?.unvoted).toBe(true);
  });

  afterAll(() => {
    app.close();
  });
});

const postsRouter2 = new Framework().group("/posts", (app) =>
  app
    .get(
      "/",
      () => {
        return {
          posts: [{ id: "post-1", title: "Post 1" }],
        };
      },
      {
        response: h.object({
          posts: h.array(h.object({ id: h.string(), title: h.string() })),
        }),
      },
    )
    .get(
      "/:id",
      (ctx) => {
        return {
          id: ctx.params.id,
          title: `Post ${ctx.params.id}`,
        };
      },
      {
        params: h.object({ id: h.string() }),
        response: h.object({ id: h.string(), title: h.string() }),
      },
    )
    .use(commentsRouter)
    .use(subscriptionsRouter)
    .use(votesRouter),
);

const app2 = new Framework().group("/api", (app) => app.use(postsRouter2)).listen(3033);

const client2 = createClient<typeof app2>("http://127.0.0.1:3033");

describe("Framework Routes - Routes Before Use", () => {
  it("should list all posts", async () => {
    const { data, ok } = await client2.api.posts.get();
    expect(ok).toBe(true);
    expect(data?.posts).toBeDefined();
  });

  it("should get a specific post when routes defined before .use()", async () => {
    const response = await fetch("http://127.0.0.1:3033/api/posts/test-post-123");
    expect(response.ok).toBe(true);
    const result = (await response.json()) as { id: string };
    expect(result.id).toBe("test-post-123");
  });

  it("should get comments when routes defined before .use()", async () => {
    const response = await fetch("http://127.0.0.1:3033/api/posts/test-post-id/comments");
    expect(response.ok).toBe(true);
    const result = (await response.json()) as { comments: unknown[] };
    expect(result.comments).toBeDefined();
  });

  afterAll(() => {
    app2.close();
  });
});
