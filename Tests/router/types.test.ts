import {
  createLayout,
  createRoute,
  createRouter,
  type Navigation,
  type RoutePaths,
} from "@hedystia/router";
import { expect, expectTypeOf, it } from "vitest";

it("preserves nested paths and rejects wrong navigation shapes in compiler contracts", () => {
  const user = createRoute("/users/$id", {
    validateSearch: () => ({ page: 1 }),
    loader: ({ params }) => ({ id: params.id }),
  });
  const routes = [createLayout("root").addChildren([createRoute("/"), user])] as const;
  const router = createRouter({ routes });
  expectTypeOf<RoutePaths<typeof routes>>().toEqualTypeOf<"/" | "/users/$id">();
  expectTypeOf<{ to: "/users/$id" }>().not.toExtend<Navigation<typeof routes, "/users/$id">>();
  expectTypeOf<{ to: "/users/$id"; params: { wrong: string } }>().not.toExtend<
    Navigation<typeof routes, "/users/$id">
  >();
  expectTypeOf<{
    to: "/users/$id";
    params: { id: string };
    search: { page: string };
  }>().not.toExtend<Navigation<typeof routes, "/users/$id">>();
  expectTypeOf<{ to: "/users/$id"; params: { id: number }; search: { page: number } }>().toExtend<
    Navigation<typeof routes, "/users/$id">
  >();
  expect(router.href({ to: "/users/$id", params: { id: 1 }, search: { page: 2 } })).toBe(
    "/users/1?page=2",
  );
});
