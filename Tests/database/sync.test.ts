import { database, integer, table, varchar } from "@hedystia/db";
import { existsSync, rmSync } from "fs";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = "/tmp/hedystia_test_sync.db";

describe("Schema Sync", () => {
  afterAll(() => {
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB);
    }
  });

  it("should create tables automatically with syncSchemas", async () => {
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB);
    }

    const users = table("sync_users", {
      id: integer().primaryKey().autoIncrement(),
      name: varchar(255).notNull(),
    });

    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB },
      syncSchemas: true,
      cache: false,
    });

    await db.initialize();

    const result = await db.sync_users.insert({ name: "SyncTest" });
    expect(result.name).toBe("SyncTest");

    await db.close();
  });

  it("should add new columns during sync", async () => {
    const users = table("sync_users", {
      id: integer().primaryKey().autoIncrement(),
      name: varchar(255).notNull(),
      newCol: integer().default(42),
    });

    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB },
      syncSchemas: true,
      cache: false,
    });

    await db.initialize();

    const result = await db.sync_users.insert({ name: "SyncTest2" });
    expect(result.name).toBe("SyncTest2");

    await db.close();
  });

  it("should not fail when table already exists", async () => {
    const users = table("sync_users", {
      id: integer().primaryKey().autoIncrement(),
      name: varchar(255).notNull(),
    });

    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB },
      syncSchemas: true,
      cache: false,
    });

    await db.initialize();
    const count = await db.sync_users.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await db.close();
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB);
    }
  });
});
