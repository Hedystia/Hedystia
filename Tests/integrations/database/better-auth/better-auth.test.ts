import {
  authFlowTestSuite,
  normalTestSuite,
  testAdapter,
  uuidTestSuite,
} from "@better-auth/test-utils/adapter";
import { hedystiaAdapter } from "@hedystia/better-auth";
import { database } from "@hedystia/db";
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
  runMigrations: async () => {
    await db.initialize();
  },
  tests: [
    normalTestSuite({
      disableTests: {
        "findOne - should find a model with modified field name": true,
        "findOne - should join a model with modified field name": true,
        "findMany - should select fields": true,
      },
    }),
    authFlowTestSuite(),
    uuidTestSuite({
      disableTests: {
        "findOne - should find a model with modified field name": true,
        "findOne - should join a model with modified field name": true,
        "findMany - should select fields": true,
      },
    }),
  ],
  async onFinish() {
    await db.close();
  },
});

describe("Better Auth Adapter", () => {
  execute();
});
