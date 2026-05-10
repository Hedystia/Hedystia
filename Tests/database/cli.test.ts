import { generateMigrationTemplate, generateSchemaTemplate } from "@hedystia/db";
import { existsSync, mkdirSync, rmSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_CLI_DIR = "/tmp/hedystia_test_cli";

describe("database CLI", () => {
  beforeAll(() => {
    if (existsSync(TEST_CLI_DIR)) {
      rmSync(TEST_CLI_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_CLI_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_CLI_DIR)) {
      rmSync(TEST_CLI_DIR, { recursive: true, force: true });
    }
  });

  it("should generate a migration template", () => {
    const template = generateMigrationTemplate("test_migration", "testMigration");
    expect(template).toContain('import { migration } from "@hedystia/db";');
    expect(template).toContain('export const testMigration = migration("test_migration", {');
  });

  it("should generate a schema template", () => {
    const template = generateSchemaTemplate("users");
    expect(template).toContain('import { table, integer, datetime } from "@hedystia/db";');
    expect(template).toContain('export const users = table("users", {');
  });
});
