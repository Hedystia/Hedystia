import { integer, SchemaRegistry, table, text, varchar } from "@hedystia/db";
import { describe, expect, it } from "vitest";

const users = table("users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
  email: varchar(255).unique(),
});

const posts = table("posts", {
  id: integer().primaryKey().autoIncrement(),
  userId: integer()
    .name("user_id")
    .references(() => users.id, { onDelete: "CASCADE" }),
  title: varchar(255).notNull(),
  content: text(),
});

describe("Schema Registry", () => {
  it("should register schemas", () => {
    const registry = new SchemaRegistry();
    registry.register([users, posts]);

    expect(registry.getTable("users")).toBeDefined();
    expect(registry.getTable("posts")).toBeDefined();
    expect(registry.getTable("nonexistent")).toBeUndefined();
  });

  it("should resolve references", () => {
    const registry = new SchemaRegistry();
    registry.register([users, posts]);

    const postsTable = registry.getTable("posts")!;
    const userIdCol = postsTable.columns.find((c) => c.name === "user_id")!;
    expect(userIdCol.references).toBeDefined();
    expect(userIdCol.references!.table).toBe("users");
    expect(userIdCol.references!.column).toBe("id");
    expect(userIdCol.references!.onDelete).toBe("CASCADE");
  });

  it("should track relations", () => {
    const registry = new SchemaRegistry();
    registry.register([users, posts]);

    const postRelations = registry.getRelations("posts");
    expect(postRelations.length).toBeGreaterThan(0);

    const userRelations = registry.getRelations("users");
    expect(userRelations.length).toBeGreaterThan(0);
  });

  it("should get primary key", () => {
    const registry = new SchemaRegistry();
    registry.register([users, posts]);

    expect(registry.getPrimaryKey("users")).toBe("id");
    expect(registry.getPrimaryKey("posts")).toBe("id");
    expect(registry.getPrimaryKey("nonexistent")).toBeNull();
  });

  it("should get all tables", () => {
    const registry = new SchemaRegistry();
    registry.register([users, posts]);

    const allTables = registry.getAllTables();
    expect(allTables.size).toBe(2);
    expect(allTables.has("users")).toBe(true);
    expect(allTables.has("posts")).toBe(true);
  });

  it("should resolve direct references (without arrow function)", () => {
    const authors = table("authors", {
      id: integer().primaryKey().autoIncrement(),
      name: varchar(255).notNull(),
    });

    const articles = table("articles", {
      id: integer().primaryKey().autoIncrement(),
      authorId: integer().name("author_id").references(authors.id, { onDelete: "CASCADE" }),
      title: varchar(255).notNull(),
    });

    const registry = new SchemaRegistry();
    registry.register([authors, articles]);

    const articlesTable = registry.getTable("articles")!;
    const authorIdCol = articlesTable.columns.find((c) => c.name === "author_id")!;
    expect(authorIdCol.references).toBeDefined();
    expect(authorIdCol.references!.table).toBe("authors");
    expect(authorIdCol.references!.column).toBe("id");
    expect(authorIdCol.references!.onDelete).toBe("CASCADE");
  });

  it("should throw on invalid schema", () => {
    const registry = new SchemaRegistry();
    expect(() => registry.register([{} as any])).toThrow();
  });
});
