import type { InferInsert } from "@hedystia/db";
import { integer, table, varchar } from "@hedystia/db";
import { describe, expect, it } from "vitest";

const users = table("infer_insert_users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
  email: varchar(255).notNull(),
});

type UserInsert = InferInsert<typeof users>;

const validInsert: UserInsert = {
  name: "Alice",
  email: "alice@example.com",
};

const validInsertWithId: UserInsert = {
  id: 1,
  name: "Alice",
  email: "alice@example.com",
};

// These assignments are intentionally invalid: non-auto-increment columns remain required.
// @ts-expect-error name is required
const missingName: UserInsert = { email: "alice@example.com" };
// @ts-expect-error email is required
const missingEmail: UserInsert = { name: "Alice" };

describe("InferInsert", () => {
  it("keeps auto-increment keys optional and other keys required", () => {
    expect(validInsert).toEqual({ name: "Alice", email: "alice@example.com" });
    expect(validInsertWithId.id).toBe(1);
  });
});
