import { hedystiaAdapter } from "@hedystia/better-auth";
import { database } from "@hedystia/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const db = database({ schemas: {}, database: "sqlite", connection: { filename: ":memory:" } });
let auth: ReturnType<ReturnType<typeof hedystiaAdapter>>;
beforeAll(async () => {
  await db.initialize();
  auth = hedystiaAdapter(db)({});
  await db
    .getDriver()
    .execute(
      "CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT, emailVerified INTEGER, createdAt TEXT, updatedAt TEXT)",
    );
  await db
    .getDriver()
    .execute("INSERT INTO user (id, name, email) VALUES (?, ?, ?)", [
      "1",
      "Alice",
      "alice@example.test",
    ]);
  await db
    .getDriver()
    .execute("INSERT INTO user (id, name, email) VALUES (?, ?, ?)", [
      "2",
      "Bob",
      "bob@example.test",
    ]);
});
afterAll(() => db.close());

describe("Better Auth pagination", () => {
  it("respects zero limit instead of returning the default page", async () => {
    expect(await auth.findMany({ model: "user", limit: 0 })).toEqual([]);
  });
  it("applies offset and limit deterministically", async () => {
    const rows = await auth.findMany<{ id: string }>({
      model: "user",
      limit: 1,
      offset: 1,
      sortBy: { field: "id", direction: "asc" },
    });
    expect(rows.map((row) => row.id)).toEqual(["2"]);
  });
  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid page bounds %s", async (value) => {
    await expect(auth.findMany({ model: "user", limit: value })).rejects.toThrow();
    await expect(auth.findMany({ model: "user", offset: value })).rejects.toThrow();
  });
  it("propagates database failures instead of pretending there are no accounts", async () => {
    const failure = new Error("database unavailable");
    const query = vi.spyOn(db.getDriver(), "query").mockRejectedValueOnce(failure);
    try {
      await expect(auth.findMany({ model: "user" })).rejects.toThrow("database unavailable");
    } finally {
      query.mockRestore();
    }
  });
});
