import { existsSync, mkdirSync, rmSync } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (typeof process !== "undefined" && !process.versions.bun) {
  describe("database CLI", () => {
    it.skip("CLI tests only run in Bun", () => {});
  });
} else {
  // We use dynamic imports here because 'bun' is not available in Node.js
  // and would cause a top-level error in Vitest/Node environment.
  const { generateMigrationTemplate, generateSchemaTemplate } = await import("@hedystia/db");

  const TEST_CLI_DIR = "/tmp/hedystia_test_cli";
  const _CLI_PATH = path.resolve(import.meta.dirname, "../../Packages/database/src/cli.ts");

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
}
