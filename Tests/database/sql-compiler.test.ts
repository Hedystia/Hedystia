import type { ColumnMetadata, TableMetadata } from "@hedystia/db";
import {
  compileColumnDef,
  compileCreateTable,
  compileDelete,
  compileInsert,
  compileSelect,
  compileUpdate,
  compileWhere,
} from "@hedystia/db";
import { describe, expect, it } from "vitest";

describe("SQL Compiler", () => {
  describe("compileColumnDef", () => {
    it("should compile a basic column", () => {
      const col: ColumnMetadata = {
        name: "id",
        type: "integer",
        primaryKey: true,
        autoIncrement: true,
        notNull: true,
        unique: true,
        defaultValue: undefined,
      };
      const result = compileColumnDef(col, "sqlite");
      expect(result).toContain("INTEGER");
      expect(result).toContain("PRIMARY KEY");
      expect(result).toContain("AUTOINCREMENT");
    });

    it("should compile varchar with length for mysql", () => {
      const col: ColumnMetadata = {
        name: "name",
        type: "varchar",
        primaryKey: false,
        autoIncrement: false,
        notNull: true,
        unique: false,
        defaultValue: undefined,
        length: 100,
      };
      const result = compileColumnDef(col, "mysql");
      expect(result).toContain("VARCHAR(100)");
      expect(result).toContain("NOT NULL");
    });

    it("should compile with default value", () => {
      const col: ColumnMetadata = {
        name: "count",
        type: "integer",
        primaryKey: false,
        autoIncrement: false,
        notNull: false,
        unique: false,
        defaultValue: 0,
      };
      const result = compileColumnDef(col, "sqlite");
      expect(result).toContain("DEFAULT 0");
    });

    it("should compile array column as JSON", () => {
      const col: ColumnMetadata = {
        name: "tags",
        type: "array",
        primaryKey: false,
        autoIncrement: false,
        notNull: false,
        unique: false,
        defaultValue: undefined,
      };
      const result = compileColumnDef(col, "mysql");
      expect(result).toContain("JSON");
      const sqliteResult = compileColumnDef(col, "sqlite");
      expect(sqliteResult).toContain("TEXT");
    });

    it("should compile unique column", () => {
      const col: ColumnMetadata = {
        name: "email",
        type: "varchar",
        primaryKey: false,
        autoIncrement: false,
        notNull: false,
        unique: true,
        defaultValue: undefined,
        length: 255,
      };
      const result = compileColumnDef(col, "mysql");
      expect(result).toContain("UNIQUE");
    });
  });

  describe("compileCreateTable", () => {
    it("should compile a create table statement", () => {
      const table: TableMetadata = {
        name: "users",
        columns: [
          {
            name: "id",
            type: "integer",
            primaryKey: true,
            autoIncrement: true,
            notNull: true,
            unique: true,
            defaultValue: undefined,
          },
          {
            name: "name",
            type: "varchar",
            primaryKey: false,
            autoIncrement: false,
            notNull: true,
            unique: false,
            defaultValue: undefined,
            length: 255,
          },
        ],
      };
      const result = compileCreateTable(table, "sqlite");
      expect(result).toContain("CREATE TABLE IF NOT EXISTS");
      expect(result).toContain("`users`");
      expect(result).toContain("`id`");
      expect(result).toContain("`name`");
    });

    it("should include foreign key constraints", () => {
      const table: TableMetadata = {
        name: "posts",
        columns: [
          {
            name: "id",
            type: "integer",
            primaryKey: true,
            autoIncrement: true,
            notNull: true,
            unique: true,
            defaultValue: undefined,
          },
          {
            name: "userId",
            type: "integer",
            primaryKey: false,
            autoIncrement: false,
            notNull: false,
            unique: false,
            defaultValue: undefined,
            references: { table: "users", column: "id", onDelete: "CASCADE" },
          },
        ],
      };
      const result = compileCreateTable(table, "mysql");
      expect(result).toContain("FOREIGN KEY");
      expect(result).toContain("REFERENCES");
      expect(result).toContain("ON DELETE CASCADE");
    });
  });

  describe("compileWhere", () => {
    it("should compile simple equality", () => {
      const params: unknown[] = [];
      const result = compileWhere({ name: "Alice" }, params);
      expect(result).toBe("`name` = ?");
      expect(params).toEqual(["Alice"]);
    });

    it("should compile comparison operators", () => {
      const params: unknown[] = [];
      const result = compileWhere({ age: { gte: 18, lt: 65 } }, params);
      expect(result).toContain("`age` >= ?");
      expect(result).toContain("`age` < ?");
      expect(params).toEqual([18, 65]);
    });

    it("should compile LIKE", () => {
      const params: unknown[] = [];
      const result = compileWhere({ name: { like: "%test%" } }, params);
      expect(result).toContain("LIKE");
      expect(params).toEqual(["%test%"]);
    });

    it("should compile IN", () => {
      const params: unknown[] = [];
      const result = compileWhere({ id: { in: [1, 2, 3] } }, params);
      expect(result).toContain("IN");
      expect(params).toEqual([1, 2, 3]);
    });

    it("should compile IS NULL", () => {
      const params: unknown[] = [];
      const result = compileWhere({ email: { isNull: true } }, params);
      expect(result).toContain("IS NULL");
    });

    it("should compile BETWEEN", () => {
      const params: unknown[] = [];
      const result = compileWhere({ age: { between: [10, 50] } }, params);
      expect(result).toContain("BETWEEN");
      expect(params).toEqual([10, 50]);
    });

    it("should compile OR conditions", () => {
      const params: unknown[] = [];
      const result = compileWhere({ OR: [{ name: "A" }, { name: "B" }] }, params);
      expect(result).toContain("OR");
      expect(params).toEqual(["A", "B"]);
    });
  });

  describe("compileSelect", () => {
    it("should compile basic select", () => {
      const params: unknown[] = [];
      const result = compileSelect("users", {}, params);
      expect(result).toBe("SELECT * FROM `users`");
    });

    it("should compile select with columns", () => {
      const params: unknown[] = [];
      const result = compileSelect("users", { select: ["name", "email"] }, params);
      expect(result).toContain("`name`");
      expect(result).toContain("`email`");
    });

    it("should compile select with where", () => {
      const params: unknown[] = [];
      const result = compileSelect("users", { where: { name: "Alice" } }, params);
      expect(result).toContain("WHERE");
      expect(params).toEqual(["Alice"]);
    });

    it("should compile select with orderBy", () => {
      const params: unknown[] = [];
      const result = compileSelect("users", { orderBy: { name: "asc" } }, params);
      expect(result).toContain("ORDER BY");
      expect(result).toContain("ASC");
    });

    it("should compile select with limit and offset", () => {
      const params: unknown[] = [];
      const result = compileSelect("users", { take: 10, skip: 5 }, params);
      expect(result).toContain("LIMIT 10");
      expect(result).toContain("OFFSET 5");
    });
  });

  describe("compileInsert", () => {
    it("should compile an insert statement", () => {
      const params: unknown[] = [];
      const result = compileInsert("users", { name: "Alice", email: "a@b.com" }, params);
      expect(result).toContain("INSERT INTO `users`");
      expect(result).toContain("`name`");
      expect(result).toContain("`email`");
      expect(params).toEqual(["Alice", "a@b.com"]);
    });
  });

  describe("compileUpdate", () => {
    it("should compile an update statement", () => {
      const params: unknown[] = [];
      const result = compileUpdate("users", { name: "Bob" }, { id: 1 }, params);
      expect(result).toContain("UPDATE `users` SET");
      expect(result).toContain("`name` = ?");
      expect(result).toContain("WHERE");
      expect(params).toEqual(["Bob", 1]);
    });
  });

  describe("compileDelete", () => {
    it("should compile a delete statement", () => {
      const params: unknown[] = [];
      const result = compileDelete("users", { id: 1 }, params);
      expect(result).toContain("DELETE FROM `users`");
      expect(result).toContain("WHERE");
      expect(params).toEqual([1]);
    });
  });
});
