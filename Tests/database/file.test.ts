import { array, database, integer, table, varchar } from "@hedystia/db";
import { existsSync, rmSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DIR = "/tmp/hedystia_test_filedb";

const users = table("hedystia_test_users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
  email: varchar(255).unique(),
  age: integer().default(0),
  tags: array().type<string[]>(),
});

const posts = table("hedystia_test_posts", {
  id: integer().primaryKey().autoIncrement(),
  userId: integer().references(users.id),
  title: varchar(255).notNull(),
});

const db = database({
  schemas: { users, posts },
  database: "file",
  connection: { directory: TEST_DIR },
  syncSchemas: true,
  cache: false,
});

describe("File Driver", () => {
  beforeAll(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    await db.initialize();
  });

  afterAll(async () => {
    await db.close();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("insert", () => {
    it("should insert a row with auto increment", async () => {
      const user = await db.users.insert({ name: "Alice", email: "alice@file.com", age: 25 });
      expect(user.id).toBe(1);
      expect(user.name).toBe("Alice");
    });

    it("should auto increment ids", async () => {
      const user = await db.users.insert({ name: "Bob", email: "bob@file.com", age: 30 });
      expect(user.id).toBe(2);
    });

    it("should insert with array data", async () => {
      const user = await db.users.insert({
        name: "ArrayUser",
        email: "array@file.com",
        tags: ["tag1", "tag2"],
      });
      expect(user.name).toBe("ArrayUser");
      expect(user.tags).toEqual(["tag1", "tag2"]);
    });
  });

  describe("insertMany", () => {
    it("should insert multiple rows", async () => {
      const result = await db.users.insertMany([
        { name: "Charlie", email: "charlie@file.com" },
        { name: "Diana", email: "diana@file.com" },
      ]);
      expect(result.length).toBe(2);
    });
  });

  describe("find", () => {
    it("should find all rows", async () => {
      const result = await db.users.find();
      expect(result.length).toBe(5);
    });

    it("should find with where", async () => {
      const result = await db.users.find({ where: { name: "Alice" } });
      expect(result.length).toBe(1);
    });

    it("should find with comparison operators", async () => {
      const result = await db.users.find({ where: { age: { gte: 30 } } });
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should find with like", async () => {
      const result = await db.users.find({ where: { name: { like: "%li%" } } });
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should find with in", async () => {
      const result = await db.users.find({ where: { name: { in: ["Alice", "Bob"] } } });
      expect(result.length).toBe(2);
    });

    it("should find with orderBy", async () => {
      const result = await db.users.find({ orderBy: { name: "desc" } });
      expect(result[0]?.name).toBe("Diana");
    });

    it("should find with take and skip", async () => {
      const result = await db.users.find({ take: 2, skip: 1 });
      expect(result.length).toBe(2);
    });

    it("should find with select", async () => {
      const result = await db.users.find({ select: ["name"] });
      expect(result.length).toBe(5);
      expect(result[0]?.name).toBeDefined();
    });

    it("should find with OR", async () => {
      const result = await db.users.find({
        where: { OR: [{ name: "Alice" }, { name: "Bob" }] },
      });
      expect(result.length).toBe(2);
    });

    it("should find with AND condition", async () => {
      const result = await db.users.find({
        where: { AND: [{ name: "Alice" }, { age: { gte: 20 } }] },
      });
      expect(result.length).toBe(1);
      expect(result[0]?.name).toBe("Alice");
    });

    it("should find with AND and OR combined", async () => {
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

    it("should find with notIn", async () => {
      const result = await db.users.find({
        where: { name: { notIn: ["Alice", "Bob"] } },
      });
      expect(result.length).toBe(3);
    });

    it("should find with between", async () => {
      const result = await db.users.find({ where: { age: { between: [20, 30] } } });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("should find with neq", async () => {
      const result = await db.users.find({ where: { name: { neq: "Alice" } } });
      expect(result.length).toBe(4);
    });
  });

  describe("findMany", () => {
    it("should be an alias for find", async () => {
      const result = await db.users.findMany();
      expect(result.length).toBe(5);
    });
  });

  describe("findFirst", () => {
    it("should return first matching row", async () => {
      const user = await db.users.findFirst({ where: { name: "Alice" } });
      expect(user).not.toBeNull();
      expect(user!.name).toBe("Alice");
    });

    it("should return null for no match", async () => {
      const user = await db.users.findFirst({ where: { name: "Nobody" } });
      expect(user).toBeNull();
    });
  });

  describe("update", () => {
    it("should update matching rows", async () => {
      const result = await db.users.update({
        where: { name: "Alice" },
        data: { age: 26 },
      });
      expect(result[0]?.age).toBe(26);
    });
  });

  describe("delete", () => {
    it("should delete matching rows", async () => {
      await db.users.insert({ name: "ToDelete", email: "del@file.com" });
      const count = await db.users.delete({ where: { name: "ToDelete" } });
      expect(count).toBe(1);
    });
  });

  describe("count", () => {
    it("should count all rows", async () => {
      const count = await db.users.count();
      expect(count).toBe(5);
    });

    it("should count with where", async () => {
      const count = await db.users.count({ where: { name: "Alice" } });
      expect(count).toBe(1);
    });
  });

  describe("exists", () => {
    it("should return true when exists", async () => {
      const result = await db.users.exists({ where: { name: "Alice" } });
      expect(result).toBe(true);
    });

    it("should return false when not exists", async () => {
      const result = await db.users.exists({ where: { name: "Nobody" } });
      expect(result).toBe(false);
    });
  });

  describe("upsert", () => {
    it("should insert if not exists", async () => {
      const result = await db.users.upsert({
        where: { name: "Upserted" },
        create: { name: "Upserted", email: "ups@file.com" },
        update: { age: 50 },
      });
      expect(result.name).toBe("Upserted");
    });

    it("should update if exists", async () => {
      const result = await db.users.upsert({
        where: { name: "Upserted" },
        create: { name: "Upserted", email: "ups2@file.com" },
        update: { age: 50 },
      });
      expect(result.age).toBe(50);
    });
  });

  describe("truncate", () => {
    it("should truncate table", async () => {
      await db.posts.insert({ userId: 1, title: "Post" });
      await db.posts.truncate();
      const count = await db.posts.count();
      expect(count).toBe(0);
    });
  });

  describe("relations", () => {
    it("should load related data", async () => {
      const user = await db.users.findFirst({ where: { name: "Alice" } });
      await db.posts.insert({ userId: user!.id, title: "File Post 1" });
      await db.posts.insert({ userId: user!.id, title: "File Post 2" });

      const usersWithPosts = await db.users.find({
        where: { name: "Alice" },
        with: { posts: true },
      });
      expect(usersWithPosts[0]?.posts).toBeDefined();
      expect(usersWithPosts[0]?.posts.length).toBe(2);
    });
  });
});
