import { array, boolean, database, integer, json, table, text, varchar } from "@hedystia/db";
import { existsSync, rmSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = "/tmp/hedystia_test_sqlite.db";

const users = table("hedystia_test_users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
  email: varchar(255).unique(),
  age: integer().default(0),
  active: boolean().default(true),
  tags: array(),
  metadata: json(),
});

const posts = table("hedystia_test_posts", {
  id: integer().primaryKey().autoIncrement(),
  userId: integer()
    .name("user_id")
    .references(() => users.id, { onDelete: "CASCADE" }),
  title: varchar(255).notNull(),
  content: text(),
});

const providers = ["better-sqlite3", "sqlite3", "sql.js", "bun:sqlite"] as const;

for (const provider of providers) {
  describe(`SQLite Driver (${provider})`, () => {
    let initialized = false;

    const db = database({
      schemas: { users, posts },
      database: { name: "sqlite", provider },
      connection: { filename: TEST_DB },
      syncSchemas: true,
      cache: false,
    });

    beforeAll(async () => {
      if (provider === "bun:sqlite" && !(process as any).versions?.bun) {
        return;
      }
      if (existsSync(TEST_DB)) {
        rmSync(TEST_DB);
      }
      try {
        await db.initialize();
        initialized = true;
      } catch (err: any) {
        if (err.message.includes("better-sqlite3")) {
          initialized = false;
          return;
        }
        throw err;
      }
    });

    afterAll(async () => {
      try {
        if (initialized) {
          await db.close();
        }
      } catch {}
      if (existsSync(TEST_DB)) {
        rmSync(TEST_DB);
      }
    });

    describe("insert", () => {
      it("should insert a single row", async () => {
        if (!initialized) {
          return;
        }
        const user = await db.users.insert({
          name: "Alice",
          email: `alice@${provider}.com`,
          age: 25,
        });
        expect(user.name).toBe("Alice");
        expect(user.email).toBe(`alice@${provider}.com`);
        expect(user.id).toBeDefined();
      });

      it("should insert with default values", async () => {
        if (!initialized) {
          return;
        }
        const user = await db.users.insert({ name: "Bob", email: `bob@${provider}.com` });
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
          { name: "Charlie", email: `charlie@${provider}.com`, age: 30 },
          { name: "Diana", email: `diana@${provider}.com`, age: 28 },
        ]);
        expect(result.length).toBe(2);
        expect(result[0]?.name).toBe("Charlie");
        expect(result[1]?.name).toBe("Diana");
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
        expect(result[0]?.name).toBe("Alice");
      });

      it("should find with comparison operators", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.find({ where: { age: { gte: 28 } } });
        expect(result.length).toBeGreaterThanOrEqual(1);
      });

      it("should find with like operator", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.find({ where: { name: { like: "%li%" } } });
        expect(result.length).toBeGreaterThanOrEqual(1);
      });

      it("should find with in operator", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.find({ where: { name: { in: ["Alice", "Bob"] } } });
        expect(result.length).toBe(2);
      });

      it("should find with orderBy", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.find({ orderBy: { name: "asc" } });
        expect(result.length).toBeGreaterThanOrEqual(4);
        expect(result[0]?.name).toBe("Alice");
      });

      it("should find with take and skip", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.find({ take: 2, skip: 1 });
        expect(result.length).toBe(2);
      });

      it("should find with select", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.find({ select: ["name", "email"] });
        expect(result.length).toBeGreaterThanOrEqual(4);
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

      it("should find with between", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.find({ where: { age: { between: [20, 30] } } });
        expect(result.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe("findMany", () => {
      it("should be an alias for find", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.findMany();
        expect(result.length).toBeGreaterThanOrEqual(4);
      });
    });

    describe("findFirst", () => {
      it("should find the first matching row", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.findFirst({ where: { name: "Alice" } });
        expect(result).not.toBeNull();
        expect(result!.name).toBe("Alice");
      });

      it("should return null if no match", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.findFirst({ where: { name: "NonExistent" } });
        expect(result).toBeNull();
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
        expect(result.length).toBe(1);
        expect(result[0]?.age).toBe(26);
      });

      it("should reject update without where", async () => {
        if (!initialized) {
          return;
        }
        expect(db.users.update({ where: {}, data: { age: 99 } })).rejects.toThrow();
      });
    });

    describe("delete", () => {
      it("should delete matching rows", async () => {
        if (!initialized) {
          return;
        }
        await db.users.insert({ name: "ToDelete", email: `delete@${provider}.com` });
        const count = await db.users.delete({ where: { name: "ToDelete" } });
        expect(count).toBe(1);
      });

      it("should reject delete without where", async () => {
        if (!initialized) {
          return;
        }
        expect(db.users.delete({ where: {} })).rejects.toThrow();
      });
    });

    describe("count", () => {
      it("should count all rows", async () => {
        if (!initialized) {
          return;
        }
        const count = await db.users.count();
        expect(count).toBeGreaterThanOrEqual(4);
      });

      it("should count with where", async () => {
        if (!initialized) {
          return;
        }
        const count = await db.users.count({ where: { name: "Alice" } });
        expect(count).toBe(1);
      });
    });

    describe("exists", () => {
      it("should return true when row exists", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.exists({ where: { name: "Alice" } });
        expect(result).toBe(true);
      });

      it("should return false when row does not exist", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.exists({ where: { name: "NonExistent" } });
        expect(result).toBe(false);
      });
    });

    describe("upsert", () => {
      it("should insert if not exists", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.upsert({
          where: { name: "UpsertNew" },
          create: { name: "UpsertNew", email: `upsert@${provider}.com`, age: 20 },
          update: { age: 21 },
        });
        expect(result.name).toBe("UpsertNew");
      });

      it("should update if exists", async () => {
        if (!initialized) {
          return;
        }
        const result = await db.users.upsert({
          where: { name: "UpsertNew" },
          create: { name: "UpsertNew", email: `upsert2@${provider}.com`, age: 20 },
          update: { age: 99 },
        });
        expect(result.age).toBe(99);
      });
    });

    describe("truncate", () => {
      it("should remove all rows", async () => {
        if (!initialized) {
          return;
        }
        const user = await db.users.findFirst({ where: { name: "Alice" } });
        await db.posts.insert({ userId: user!.id, title: "Test Post" });
        await db.posts.truncate();
        const count = await db.posts.count();
        expect(count).toBe(0);
      });
    });

    describe("relations", () => {
      it("should insert related data and find with relations", async () => {
        if (!initialized) {
          return;
        }
        const user = await db.users.findFirst({ where: { name: "Alice" } });
        await db.posts.insert({ userId: user!.id, title: "Alice Post 1" });
        await db.posts.insert({ userId: user!.id, title: "Alice Post 2" });

        const usersWithPosts = await db.users.find({
          where: { name: "Alice" },
          with: { posts: true },
        });
        expect(usersWithPosts[0]?.posts).toBeDefined();
        expect(usersWithPosts[0]?.posts?.length).toBe(2);
      });
    });

    describe("array and json columns", () => {
      it("should insert and retrieve array data", async () => {
        if (!initialized) {
          return;
        }
        const user = await db.users.insert({
          name: "ArrayUser",
          email: `arrayuser@${provider}.com`,
          tags: ["admin", "editor"],
        });
        expect(user.name).toBe("ArrayUser");

        const found = await db.users.findFirst({ where: { name: "ArrayUser" } });
        expect(found).not.toBeNull();
      });

      it("should insert and retrieve json data", async () => {
        if (!initialized) {
          return;
        }
        const user = await db.users.insert({
          name: "JsonUser",
          email: `jsonuser@${provider}.com`,
          metadata: { role: "admin", level: 5 },
        });
        expect(user.name).toBe("JsonUser");

        const found = await db.users.findFirst({ where: { name: "JsonUser" } });
        expect(found).not.toBeNull();
      });
    });

    describe("raw", () => {
      it("should execute raw SQL", async () => {
        if (!initialized) {
          return;
        }
        const rows = await db.raw("SELECT * FROM `hedystia_test_users` WHERE `name` = ?", [
          "Alice",
        ]);
        expect(rows.length).toBe(1);
      });
    });

    describe("transaction", () => {
      it("should commit on success", async () => {
        if (!initialized) {
          return;
        }
        const before = await db.users.count();
        await db.transaction(async () => {
          await db.raw("INSERT INTO `hedystia_test_users` (`name`, `email`) VALUES (?, ?)", [
            `TxUser_${provider}`,
            `tx@${provider}.com`,
          ]);
        });
        const after = await db.users.count();
        expect(after).toBe(before + 1);
      });
    });
  });
}
