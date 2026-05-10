import { createClient } from "@hedystia/client";
import Framework, { h } from "hedystia";
import { describe, expect, it } from "vitest";

describe("Framework .macro() Tests", () => {
  it("should apply macros to routes and context", async () => {
    const app = new Framework()
      .macro({
        auth: () => ({
          resolve: async (ctx) => {
            const authHeader = ctx.req.headers.get("Authorization");
            if (!authHeader?.startsWith("Bearer ")) {
              ctx.error(401, "Unauthorized");
            }
            const token = authHeader?.substring(7);
            return { userId: 1, token };
          },
        }),
        logger: () => ({
          resolve: () => {
            return {
              log: (message: string) => console.log(`[LOG] ${message}`),
            };
          },
        }),
      })
      .get("/public", () => {
        return { message: "Public endpoint" };
      })
      .get(
        "/protected",
        async (ctx) => {
          return {
            message: "Protected endpoint",
            user: (await ctx.auth).userId,
            token: (await ctx.auth).token,
          };
        },
        {
          auth: true,
          response: h.object({
            message: h.string(),
            user: h.number(),
            token: h.string(),
          }),
        },
      )
      .get(
        "/logged",
        (ctx) => {
          ctx.logger.log("Visited logged endpoint");
          return { message: "Logged endpoint" };
        },
        {
          logger: true,
          response: h.object({
            message: h.string(),
          }),
        },
      )
      .listen(3018);

    const client = createClient<typeof app>("http://127.0.0.1:3018");

    const publicRes = await client.public.get();
    expect(publicRes.error).toBeNull();
    expect(publicRes.data?.message).toBe("Public endpoint");

    const protectedResUnauth = await client.protected.get();
    expect(protectedResUnauth.error).not.toBeNull();
    expect(protectedResUnauth.status).toBe(401);

    const protectedResAuth = await client.protected.get({
      headers: {
        Authorization: "Bearer test-token",
      },
    });
    expect(protectedResAuth.error).toBeNull();
    expect(protectedResAuth.data?.message).toBe("Protected endpoint");
    expect(protectedResAuth.data?.user).toBe(1);
    expect(protectedResAuth.data?.token).toBe("test-token");

    const loggedRes = await client.logged.get();
    expect(loggedRes.error).toBeNull();
    expect(loggedRes.data?.message).toBe("Logged endpoint");

    app.close();
  });

  it("should allow multiple macros and macro error handling", async () => {
    const app = new Framework()
      .macro({
        premiumUser: () => ({
          resolve: async (ctx) => {
            const isPremium = ctx.req.headers.get("X-User-Type") === "premium";
            if (!isPremium) {
              ctx.error(403, "Premium feature only");
            }
            return { tier: "premium" };
          },
        }),
        rateLimit: () => ({
          resolve: async (ctx) => {
            const requestsCount = Number.parseInt(
              ctx.req.headers.get("X-Request-Count") || "0",
              10,
            );
            if (requestsCount > 5) {
              ctx.error(429, "Too many requests");
            }
            return { remaining: 5 - requestsCount };
          },
        }),
      })
      .get(
        "/premium-feature",
        async (ctx) => {
          return {
            feature: "Premium Content",
            tier: (await ctx.premiumUser).tier,
            requestsRemaining: (await ctx.rateLimit).remaining,
          };
        },
        {
          premiumUser: true,
          rateLimit: true,
          response: h.object({
            feature: h.string(),
            tier: h.string(),
            requestsRemaining: h.number(),
          }),
        },
      )
      .listen(3019);

    const client = createClient<typeof app>("http://127.0.0.1:3019");

    const validResponse = await client["premium-feature"].get({
      headers: {
        "X-User-Type": "premium",
        "X-Request-Count": "3",
      },
    });
    expect(validResponse.error).toBeNull();
    expect(validResponse.data?.feature).toBe("Premium Content");
    expect(validResponse.data?.tier).toBe("premium");
    expect(validResponse.data?.requestsRemaining).toBe(2);

    const nonPremiumResponse = await client["premium-feature"].get({
      headers: {
        "X-User-Type": "free",
        "X-Request-Count": "1",
      },
    });
    expect(nonPremiumResponse.error).not.toBeNull();
    expect(nonPremiumResponse.status).toBe(403);

    const rateLimitResponse = await client["premium-feature"].get({
      headers: {
        "X-User-Type": "premium",
        "X-Request-Count": "6",
      },
    });
    expect(rateLimitResponse.error).not.toBeNull();
    expect(rateLimitResponse.status).toBe(429);

    app.close();
  });

  it("should apply macros to grouped routes", async () => {
    const app = new Framework()
      .macro({
        auth: () => ({
          resolve: async (ctx) => {
            const authHeader = ctx.req.headers.get("Authorization");
            if (!authHeader?.startsWith("Bearer ")) {
              ctx.error(401, "Unauthorized");
            }
            return { userId: 1, token: authHeader?.substring(7) };
          },
        }),
      })
      .group(
        "/admin",
        (admin) => {
          return admin
            .get("/dashboard", () => {
              return {
                message: "Admin Dashboard",
              };
            })
            .get("/users", () => {
              return {
                message: "User List",
              };
            });
        },
        { auth: true },
      )
      .listen(3029);

    const client = createClient<typeof app>("http://127.0.0.1:3029");

    const unauthorizedRes = await client.admin.dashboard.get();
    expect(unauthorizedRes.error).not.toBeNull();
    expect(unauthorizedRes.status).toBe(401);

    const authorizedRes = await client.admin.dashboard.get({
      headers: {
        Authorization: "Bearer admin-token",
      },
    });
    expect(authorizedRes.error).toBeNull();
    expect(authorizedRes.data?.message).toBe("Admin Dashboard");

    const usersRes = await client.admin.users.get({
      headers: {
        Authorization: "Bearer admin-token",
      },
    });
    expect(usersRes.error).toBeNull();
    expect(usersRes.data?.message).toBe("User List");

    app.close();
  });

  it("should apply macros to subscriptions", async () => {
    const app = new Framework()
      .macro({
        auth: () => ({
          resolve: async (ctx) => {
            const authHeader = ctx.headers.authorization;
            if (!authHeader?.startsWith("Bearer ")) {
              const error = new Error("Unauthorized");
              (error as any).isMacroError = true;
              (error as any).statusCode = 401;
              throw error;
            }
            const token = authHeader.substring(7);
            return { userId: 1, token };
          },
        }),
      })
      .subscription(
        "/secure/updates",
        async (ctx) => {
          return {
            message: "Secure update",
            userId: (await ctx.auth).userId,
          };
        },
        {
          auth: true,
          headers: h.object({
            authorization: h.string(),
          }),
          data: h.object({
            message: h.string(),
            userId: h.number(),
          }),
          error: h.object({
            message: h.string(),
            code: h.number(),
          }),
        },
      )
      .listen(3030);

    const client = createClient<typeof app>("http://127.0.0.1:3030");

    let errorReceived = false;
    let dataReceived = false;

    const sub = client.secure.updates.subscribe(
      ({ data, error }) => {
        if (error) {
          errorReceived = true;
          expect(error.message).toBe("Unauthorized");
          expect(error.code).toBe(401);
        }
        if (data) {
          dataReceived = true;
          expect(data.message).toBe("Secure update");
          expect(data.userId).toBe(1);
        }
      },
      { headers: { authorization: "invalid" } },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(errorReceived).toBe(true);
    expect(dataReceived).toBe(false);
    sub.unsubscribe();

    errorReceived = false;
    dataReceived = false;

    const validSub = client.secure.updates.subscribe(
      ({ data, error }) => {
        if (error) {
          errorReceived = true;
        }
        if (data) {
          dataReceived = true;
          expect(data.message).toBe("Secure update");
          expect(data.userId).toBe(1);
        }
      },
      { headers: { authorization: "Bearer valid-token" } },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(errorReceived).toBe(false);
    expect(dataReceived).toBe(true);
    validSub.unsubscribe();

    app.close();
  });

  it("should apply macros to subscriptions within grouped routes", async () => {
    const app = new Framework()
      .macro({
        auth: () => ({
          resolve: async (ctx) => {
            const authHeader = ctx.headers?.authorization || ctx.req?.headers.get("Authorization");
            if (!authHeader?.startsWith("Bearer ")) {
              const error = new Error("Unauthorized");
              (error as any).isMacroError = true;
              (error as any).statusCode = 401;
              throw error;
            }
            const token = authHeader.substring(7);
            return { userId: 1, token };
          },
        }),
      })
      .group(
        "/private",
        (group) => {
          return group.subscription(
            "/notifications",
            async (ctx) => {
              return {
                message: "Private notification",
                userId: (await ctx.auth).userId,
              };
            },
            {
              headers: h.object({
                authorization: h.string(),
              }),
              data: h.object({
                message: h.string(),
                userId: h.number(),
              }),
              error: h.object({
                message: h.string(),
                code: h.number(),
              }),
            },
          );
        },
        { auth: true },
      )
      .listen(3031);

    const client = createClient<typeof app>("http://127.0.0.1:3031");

    let errorReceived = false;
    let dataReceived = false;

    const sub = client.private.notifications.subscribe(
      ({ data, error }) => {
        if (error) {
          errorReceived = true;
          expect(error.message).toBe("Unauthorized");
          expect(error.code).toBe(401);
        }
        if (data) {
          dataReceived = true;
        }
      },
      { headers: { authorization: "invalid" } },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(errorReceived).toBe(true);
    expect(dataReceived).toBe(false);
    sub.unsubscribe();

    errorReceived = false;
    dataReceived = false;

    const validSub = client.private.notifications.subscribe(
      ({ data, error }) => {
        if (error) {
          errorReceived = true;
        }
        if (data) {
          dataReceived = true;
          expect(data.message).toBe("Private notification");
          expect(data.userId).toBe(1);
        }
      },
      { headers: { authorization: "Bearer valid-token" } },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(errorReceived).toBe(false);
    expect(dataReceived).toBe(true);
    validSub.unsubscribe();

    app.close();
  });
});
