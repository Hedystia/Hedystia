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
