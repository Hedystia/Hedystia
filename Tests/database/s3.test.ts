import { array, database, integer, table, text, varchar } from "@hedystia/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = table("hedystia_test_users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
  email: varchar(255).unique(),
  bio: text(),
  age: integer().default(0),
  tags: array().type<string[]>(),
});

const posts = table("hedystia_test_posts", {
  id: integer().primaryKey().autoIncrement(),
  userId: integer().references(users.id),
  title: varchar(255).notNull(),
});

describe("S3 Driver", () => {
  let initialized = false;

  const db = database({
    schemas: { users, posts },
    database: "s3",
    connection: {
      bucket: "hedystia-test",
      endpoint: process.env.S3_URL || "http://localhost:9090",
      region: "us-east-1",
      accessKeyId: process.env.S3_KEY_ID || "admin",
      secretAccessKey: process.env.S3_ACCESS_KEY || "password",
      prefix: "test-db",
    },
    syncSchemas: true,
    cache: false,
  });

  beforeAll(async () => {
    let retries = 5;
    while (retries > 0) {
      try {
        await db.initialize();
        initialized = true;
        await db.users.truncate();
        await db.posts.truncate();
        break;
      } catch (err: any) {
        retries--;
        if (retries === 0) {
          console.warn("S3 driver test skipped:", err.message);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  }, 30000);

  afterAll(async () => {
    try {
      if (initialized) {
        await db.posts.truncate();
        await db.users.truncate();
        await db.close();
      }
    } catch {}
  });

  describe("insert", () => {
    it("should insert a row with auto increment", async () => {
      if (!initialized) {
        return;
      }
      const user = await db.users.insert({ name: "Alice", email: "alice@s3.com", age: 25 });
      expect(user.id).toBeDefined();
      expect(user.name).toBe("Alice");
    });

    it("should auto increment ids", async () => {
      if (!initialized) {
        return;
      }
      const user = await db.users.insert({ name: "Bob", email: "bob@s3.com", age: 30 });
      expect(user.id).toBeDefined();
      expect(user.id).toBeGreaterThan(1);
    });

    it("should insert with array data", async () => {
      if (!initialized) {
        return;
      }
      const user = await db.users.insert({
        name: "ArrayUser",
        email: "array@s3.com",
        tags: ["tag1", "tag2"],
      });
      expect(user.name).toBe("ArrayUser");
      expect(user.tags).toEqual(["tag1", "tag2"]);
    });
  });

  describe("insertMany", () => {
    it("should insert multiple rows", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.insertMany([
        { name: "Charlie", email: "charlie@s3.com" },
        { name: "Diana", email: "diana@s3.com" },
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
      expect(result.length).toBe(5);
    });

    it("should find with where", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({ where: { name: "Alice" } });
      expect(result.length).toBe(1);
    });

    it("should find with comparison operators", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({ where: { age: { gte: 30 } } });
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should find with like", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({ where: { name: { like: "%li%" } } });
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should find with in", async () => {
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
      const result = await db.users.find({ orderBy: { name: "desc" } });
      expect(result[0]?.name).toBe("Diana");
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
      const result = await db.users.find({ select: ["name"] });
      expect(result.length).toBe(5);
      expect(result[0]?.name).toBeDefined();
    });

    it("should find with OR", async () => {
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

    it("should find with notIn", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({
        where: { name: { notIn: ["Alice", "Bob"] } },
      });
      expect(result.length).toBe(3);
    });

    it("should find with between", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({ where: { age: { between: [20, 30] } } });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("should find with neq", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.find({ where: { name: { neq: "Alice" } } });
      expect(result.length).toBe(4);
    });
  });

  describe("findMany", () => {
    it("should be an alias for find", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.findMany();
      expect(result.length).toBe(5);
    });
  });

  describe("findFirst", () => {
    it("should return first matching row", async () => {
      if (!initialized) {
        return;
      }
      const user = await db.users.findFirst({ where: { name: "Alice" } });
      expect(user).not.toBeNull();
      expect(user!.name).toBe("Alice");
    });

    it("should return null for no match", async () => {
      if (!initialized) {
        return;
      }
      const user = await db.users.findFirst({ where: { name: "Nobody" } });
      expect(user).toBeNull();
    });
  });

  describe("update", () => {
    it("should update matching rows", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.update({
        where: { name: "Alice" },
        data: { age: 26, bio: "Updated bio" },
      });
      expect(result[0]?.age).toBe(26);
      expect(result[0]?.bio).toBe("Updated bio");
    });
  });

  describe("delete", () => {
    it("should delete matching rows", async () => {
      if (!initialized) {
        return;
      }
      await db.users.insert({ name: "ToDelete", email: "del@s3.com" });
      const count = await db.users.delete({ where: { name: "ToDelete" } });
      expect(count).toBe(1);
    });
  });

  describe("count", () => {
    it("should count all rows", async () => {
      if (!initialized) {
        return;
      }
      const count = await db.users.count();
      expect(count).toBe(5);
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
    it("should return true when exists", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.exists({ where: { name: "Alice" } });
      expect(result).toBe(true);
    });

    it("should return false when not exists", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.exists({ where: { name: "Nobody" } });
      expect(result).toBe(false);
    });
  });

  describe("upsert", () => {
    it("should insert if not exists", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.upsert({
        where: { name: "Upserted" },
        create: { name: "Upserted", email: "ups@s3.com" },
        update: { age: 50 },
      });
      expect(result.name).toBe("Upserted");
    });

    it("should update if exists", async () => {
      if (!initialized) {
        return;
      }
      const result = await db.users.upsert({
        where: { name: "Upserted" },
        create: { name: "Upserted", email: "ups2@s3.com" },
        update: { age: 50 },
      });
      expect(result.age).toBe(50);
    });
  });

  describe("truncate", () => {
    it("should truncate table", async () => {
      if (!initialized) {
        return;
      }
      await db.posts.insert({ userId: 1, title: "Post" });
      await db.posts.truncate();
      const count = await db.posts.count();
      expect(count).toBe(0);
    });
  });

  describe("relations", () => {
    it("should load related data", async () => {
      if (!initialized) {
        return;
      }
      const user = await db.users.findFirst({ where: { name: "Alice" } });
      await db.posts.insert({ userId: user!.id, title: "S3 Post 1" });
      await db.posts.insert({ userId: user!.id, title: "S3 Post 2" });

      const usersWithPosts = await db.users.find({
        where: { name: "Alice" },
        with: { posts: true },
      });
      expect(usersWithPosts[0]?.posts).toBeDefined();
      expect(usersWithPosts[0]?.posts.length).toBe(2);
    });
  });
});
