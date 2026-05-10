import { CacheManager, database, integer, table, varchar } from "@hedystia/db";
import { existsSync, rmSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = "/tmp/hedystia_test_cache.db";

const users = table("users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
  email: varchar(255),
  age: integer().default(0),
});

const db = database({
  schemas: [users],
  database: "sqlite",
  connection: { filename: TEST_DB },
  syncSchemas: true,
  cache: {
    enabled: true,
    ttl: 5000,
    maxTtl: 30000,
    maxEntries: 1000,
  },
});

describe("Cache System", () => {
  beforeAll(async () => {
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB);
    }
    await db.initialize();
  });

  afterAll(async () => {
    await db.close();
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB);
    }
  });

  describe("CacheManager", () => {
    it("should create cache manager with boolean config", () => {
      const cache = new CacheManager(true);
      expect(cache.isEnabled).toBe(true);
    });

    it("should create disabled cache manager", () => {
      const cache = new CacheManager(false);
      expect(cache.isEnabled).toBe(false);
    });

    it("should create cache manager with full config", () => {
      const cache = new CacheManager({ enabled: true, ttl: 1000, maxTtl: 5000, maxEntries: 100 });
      expect(cache.isEnabled).toBe(true);
    });

    it("should cache and retrieve values", async () => {
      const cache = new CacheManager(true);
      let callCount = 0;
      const executor = async () => {
        callCount++;
        return [{ id: 1, name: "test" }];
      };

      const r1 = await cache.getOrSet("users", "find", {}, executor);
      const r2 = await cache.getOrSet("users", "find", {}, executor);

      expect(r1).toEqual(r2);
      expect(callCount).toBe(1);
    });

    it("should cache entities by primary key", () => {
      const cache = new CacheManager(true);
      cache.setEntity("users", 1, { id: 1, name: "test" });
      const entity = cache.getEntity("users", 1);
      expect(entity).toEqual({ id: 1, name: "test" });
    });

    it("should invalidate table cache", () => {
      const cache = new CacheManager(true);
      cache.setEntity("users", 1, { id: 1 });
      cache.invalidateTable("users");
      expect(cache.getEntity("users", 1)).toBeUndefined();
    });

    it("should update entity in cache", () => {
      const cache = new CacheManager(true);
      cache.setEntity("users", 1, { id: 1, name: "old" });
      cache.updateEntity("users", 1, { name: "new" });
      const entity = cache.getEntity("users", 1) as any;
      expect(entity.name).toBe("new");
    });

    it("should clear all cache", () => {
      const cache = new CacheManager(true);
      cache.setEntity("users", 1, { id: 1 });
      cache.setEntity("users", 2, { id: 2 });
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it("should not cache when disabled", async () => {
      const cache = new CacheManager(false);
      let callCount = 0;
      const executor = async () => {
        callCount++;
        return [{ id: 1 }];
      };

      await cache.getOrSet("users", "find", {}, executor);
      await cache.getOrSet("users", "find", {}, executor);
      expect(callCount).toBe(2);
    });

    it("should respect table-level cache config via getOrSetWithTableConfig", async () => {
      const cache = new CacheManager(false);
      let callCount = 0;
      const executor = async () => {
        callCount++;
        return [{ id: 1 }];
      };

      // Global cache is disabled, but table config enables it
      const r1 = await cache.getOrSetWithTableConfig("users", "find", {}, executor, {
        enabled: true,
        ttl: 5000,
      });
      const r2 = await cache.getOrSetWithTableConfig("users", "find", {}, executor, {
        enabled: true,
        ttl: 5000,
      });
      expect(r1).toEqual(r2);
      expect(callCount).toBe(1);
    });

    it("should skip cache when table config disables it", async () => {
      const cache = new CacheManager(true);
      let callCount = 0;
      const executor = async () => {
        callCount++;
        return [{ id: 1 }];
      };

      // Global cache is enabled, but table config disables it
      await cache.getOrSetWithTableConfig("nocache", "find", {}, executor, { enabled: false });
      await cache.getOrSetWithTableConfig("nocache", "find", {}, executor, { enabled: false });
      expect(callCount).toBe(2);
    });
  });

  describe("Database with cache", () => {
    it("should cache find results", async () => {
      await db.users.insert({ name: "CacheUser1", email: "cache1@test.com", age: 25 });

      const r1 = await db.users.find({ where: { name: "CacheUser1" } });
      const r2 = await db.users.find({ where: { name: "CacheUser1" } });
      expect(r1).toEqual(r2);
    });

    it("should invalidate cache on insert", async () => {
      const before = await db.users.find();
      await db.users.insert({ name: "CacheUser2", email: "cache2@test.com" });
      const after = await db.users.find();
      expect(after.length).toBe(before.length + 1);
    });

    it("should invalidate cache on update", async () => {
      await db.users.insert({ name: "CacheUser3", email: "cache3@test.com", age: 10 });
      const before = await db.users.findFirst({ where: { name: "CacheUser3" } });
      await db.users.update({ where: { name: "CacheUser3" }, data: { age: 99 } });
      const after = await db.users.findFirst({ where: { name: "CacheUser3" } });
      expect(before!.age).toBe(10);
      expect(after!.age).toBe(99);
    });

    it("should invalidate cache on delete", async () => {
      await db.users.insert({ name: "CacheDelete", email: "cachedel@test.com" });
      const before = await db.users.count();
      await db.users.delete({ where: { name: "CacheDelete" } });
      const after = await db.users.count();
      expect(after).toBe(before - 1);
    });
  });

  describe("Per-table cache", () => {
    it("should work with table-level cache configuration", async () => {
      const TEST_DB_TC = "/tmp/hedystia_test_table_cache.db";
      if (existsSync(TEST_DB_TC)) {
        rmSync(TEST_DB_TC);
      }

      const cachedUsers = table(
        "cached_users",
        {
          id: integer().primaryKey().autoIncrement(),
          name: varchar(255).notNull(),
        },
        { cache: { enabled: true, ttl: 10000 } },
      );

      const dbTC = database({
        schemas: [cachedUsers],
        database: "sqlite",
        connection: { filename: TEST_DB_TC },
        syncSchemas: true,
        cache: false,
      });

      await dbTC.initialize();
      await dbTC.cached_users.insert({ name: "CachedUser" });

      const r1 = await dbTC.cached_users.find({ where: { name: "CachedUser" } });
      const r2 = await dbTC.cached_users.find({ where: { name: "CachedUser" } });
      expect(r1).toEqual(r2);

      await dbTC.close();
      if (existsSync(TEST_DB_TC)) {
        rmSync(TEST_DB_TC);
      }
    });
  });
});
