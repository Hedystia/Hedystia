import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { boolean, database, integer, migration, table, text, varchar } from "@hedystia/db";

const users = table("hedystia_test_users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
  email: varchar(255).unique(),
  age: integer().default(0),
  active: boolean().default(true),
});

const posts = table("hedystia_test_posts", {
  id: integer().primaryKey().autoIncrement(),
  userId: integer()
    .name("user_id")
    .references(() => users.id, { onDelete: "CASCADE" }),
  title: varchar(255).notNull(),
  content: text(),
});

const addScoreColumn = migration("add_score_to_users", {
  async up({ schema }) {
    await schema.addColumn("hedystia_test_users", "score", {
      name: "score",
      type: "float",
      primaryKey: false,
      autoIncrement: false,
      notNull: false,
      unique: false,
      defaultValue: 0,
    });
  },
  async down({ schema }) {
    await schema.dropColumn("hedystia_test_users", "score");
  },
});

describe("PostgreSQL Driver (pg)", () => {
  let initialized = false;

  const db = database({
    schemas: { users, posts },
    database: { name: "postgres", provider: "pg" },
    connection: {
      host: process.env.POSTGRES_HOST ?? "localhost",
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: process.env.POSTGRES_USER ?? "root",
      password: process.env.POSTGRES_PASSWORD ?? "",
      database: process.env.POSTGRES_DATABASE ?? "hedystia_test",
    },
    syncSchemas: true,
    runMigrations: true,
    migrations: [addScoreColumn],
    cache: {
      enabled: true,
      ttl: 5000,
      maxTtl: 30000,
      maxEntries: 1000,
    },
  });

  beforeAll(async () => {
    try {
      await db.initialize();
      initialized = true;
    } catch (err: any) {
      if (err.message.includes("ECONNREFUSED")) {
        console.warn("Skipping tests for PostgreSQL: not available");
        return;
      }
      try {
        const driver = db.getDriver();
        await driver.execute('DROP TABLE IF EXISTS "hedystia_test_posts"');
        await driver.execute('DROP TABLE IF EXISTS "hedystia_test_users"');
        await driver.execute('DROP TABLE IF EXISTS "__hedystia_migrations"');
        await db.initialize();
        initialized = true;
      } catch {}
    }
    try {
      if (initialized) {
        await db.posts.truncate();
        await db.users.truncate();
      }
    } catch {}
  });

  afterAll(async () => {
    try {
      if (initialized) {
        await db.close();
      }
    } catch {}
  });

  describe("insert", () => {
    it("should insert a single row", async () => {
      if (!initialized) {
        return;
      }
      const user = await db.users.insert({
        name: "Alice",
        email: "alice@postgres.com",
        age: 25,
      });
      expect(user.name).toBe("Alice");
      expect(user.id).toBeDefined();
    });

    it("should insert with default values", async () => {
      if (!initialized) {
        return;
      }
      const user = await db.users.insert({
        name: "Bob",
        email: "bob@postgres.com",
      });
      expect(user.name).toBe("Bob");
      expect(user.id).toBeDefined();
    });
  });

  describe("insertMany", () => {
    it("should insert multiple rows", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.insertMany([
        { name: "Charlie", email: "charlie@postgres.com", age: 30 },
        { name: "Diana", email: "diana@postgres.com", age: 28 },
      ]);
      expect(result.length).toBe(2);
    });
  });

  describe("find", () => {
    it("should find all rows", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find();
      expect(result.length).toBeGreaterThanOrEqual(4);
    });

    it("should find with where clause", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({ where: { name: "Alice" } });
      expect(result.length).toBe(1);
    });

    it("should find with OR condition", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({
        where: { OR: [{ name: "Alice" }, { name: "Bob" }] },
      });
      expect(result.length).toBe(2);
    });

    it("should find with AND condition", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({
        where: { AND: [{ name: "Alice" }, { age: { gte: 20 } }] },
      });
      expect(result.length).toBe(1);
      expect(result[0]?.name).toBe("Alice");
    });

    it("should find with AND and OR combined", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({
        where: {
          AND: [{ age: { gte: 25 } }],
          OR: [{ name: "Alice" }, { name: "Charlie" }],
        },
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      for (const user of result) {
        expect(["Alice", "Charlie"]).toContain(user.name);
      }
    });
  });

  describe("update", () => {
    it("should update matching rows", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.update({
        where: { name: "Alice" },
        data: { age: 26 },
      });
      expect(result[0]?.age).toBe(26);
    });
  });

  describe("relations", () => {
    it("should insert related data and find with relations", async () => {
      if (!initialized) {
        return;
      }
      const user = await db.users.findFirst({ where: { name: "Alice" } });
      await db.posts.insert({ userId: user!.id, title: "PostgreSQL Post 1" });
      await db.posts.insert({ userId: user!.id, title: "PostgreSQL Post 2" });

      const usersWithPosts = await db.users.find({
        where: { name: "Alice" },
        with: { posts: true },
      });
      expect(usersWithPosts[0]?.posts?.length).toBe(2);
    });
  });

  describe("cache", () => {
    it("should cache find results", async () => {
      if (!initialized) {
        return;
      }
      const r1 = await db.users.find({ where: { name: "Alice" } });
      const r2 = await db.users.find({ where: { name: "Alice" } });
      expect(r1).toEqual(r2);
    });

    it("should invalidate cache on insert", async () => {
      if (!initialized) {
        return;
      }
      const before = await db.users.find();
      await db.users.insert({
        name: "CacheTest",
        email: "cachetest@postgres.com",
      });
      const after = await db.users.find();
      expect(after.length).toBe(before.length + 1);
    });
  });
});
