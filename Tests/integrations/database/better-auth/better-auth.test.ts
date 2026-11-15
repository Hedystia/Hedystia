import {
  authFlowTestSuite,
  caseInsensitiveTestSuite,
  joinsTestSuite,
  normalTestSuite,
  testAdapter,
  transactionsTestSuite,
  uuidTestSuite,
} from "@better-auth/test-utils/adapter";
import { hedystiaAdapter } from "@hedystia/better-auth";
import { database } from "@hedystia/db";
import { getAuthTables } from "better-auth/db";
import { describe } from "vitest";

const db = database({
  schemas: {},
  database: { name: "sqlite", provider: "sqlite3" },
  connection: { filename: ":memory:" },
  syncSchemas: true,
});

const { execute } = await testAdapter({
  adapter: () => {
    return hedystiaAdapter(db, {
      debugLogs: false,
    });
  },
  runMigrations: async (options) => {
    await db.initialize();
    const driver = db.getDriver();
    // Empty joined models need real tables too. Do not depend on lazy inserts
    // or swallowed query errors to make an absent table look like an empty one.
    for (const schema of Object.values(getAuthTables(options))) {
      if (await driver.tableExists(schema.modelName)) {
        continue;
      }
      const columns = Object.entries({ id: { type: "string" }, ...schema.fields }).map(
        ([name, field]) => ({
          name: "fieldName" in field ? field.fieldName || name : name,
          type:
            field.type === "number"
              ? "integer"
              : field.type === "boolean"
                ? "boolean"
                : field.type === "date"
                  ? "datetime"
                  : "text",
          primaryKey: name === "id",
          autoIncrement: false,
          notNull: name === "id",
          unique: name === "id" || ("unique" in field && field.unique === true),
        }),
      );
      await driver.createTable({ name: schema.modelName, columns });
    }
  },
  tests: [
    normalTestSuite(),
    authFlowTestSuite(),
    uuidTestSuite(),
    caseInsensitiveTestSuite(),
    joinsTestSuite(),
    transactionsTestSuite(),
  ],
  async onFinish() {
    await db.close();
  },
});

describe("Better Auth Adapter", () => {
  execute();
});
