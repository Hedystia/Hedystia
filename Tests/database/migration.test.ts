import { database, integer, migration, table, varchar } from "@hedystia/db";
import { existsSync, rmSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = "/tmp/hedystia_test_migration.db";
const TEST_DB_MANUAL = "/tmp/hedystia_test_migration_manual.db";
const TEST_DB_CONN = "/tmp/hedystia_test_migration_conn.db";

const users = table("users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
  email: varchar(255),
});

const addAgeColumn = migration("add_age_column", {
  async up({ sql }) {
    await sql("ALTER TABLE `users` ADD COLUMN `age` INTEGER DEFAULT 0");
  },
  async down({ sql }) {
    await sql("ALTER TABLE `users` DROP COLUMN `age`");
  },
});

const addScoreColumn = migration("add_score_column", {
  async up({ sql }) {
    await sql("ALTER TABLE `users` ADD COLUMN `score` REAL DEFAULT 0.0");
  },
  async down({ sql }) {
    await sql("ALTER TABLE `users` DROP COLUMN `score`");
  },
});

const db = database({
  schemas: [users],
  database: "sqlite",
  connection: { filename: TEST_DB },
  syncSchemas: true,
  runMigrations: true,
  migrations: [addAgeColumn, addScoreColumn],
  cache: false,
});

describe("Migrations", () => {
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

  it("should create migration definition", () => {
    const m = migration("test", {
      up: async () => {},
      down: async () => {},
    });
    expect(m.name).toBe("test");
    expect(typeof m.up).toBe("function");
    expect(typeof m.down).toBe("function");
  });

  it("should run migrations on initialize", async () => {
    const rows = await db.raw("SELECT name FROM `__hedystia_migrations`");
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe("add_age_column");
    expect(rows[1].name).toBe("add_score_column");
  });

  it("should not re-run completed migrations", async () => {
    await db.close();
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB);
    }

    const db2 = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB },
      syncSchemas: true,
      runMigrations: true,
      migrations: [addAgeColumn, addScoreColumn],
      cache: false,
    });

    await db2.initialize();
    const rows = await db2.raw("SELECT name FROM `__hedystia_migrations`");
    expect(rows.length).toBe(2);

    await db2.close();
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB);
    }
  });
});

describe("migrateUp", () => {
  const cleanup = () => {
    for (const f of [TEST_DB_MANUAL, `${TEST_DB_MANUAL}-shm`, `${TEST_DB_MANUAL}-wal`]) {
      if (existsSync(f)) {
        rmSync(f);
      }
    }
  };

  beforeAll(cleanup);
  afterAll(cleanup);

  it("should run pending migrations manually", async () => {
    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB_MANUAL },
      syncSchemas: true,
      runMigrations: false,
      migrations: [addAgeColumn, addScoreColumn],
      cache: false,
    });

    await db.initialize();

    await db.migrateUp();

    const after = await db.raw("SELECT name FROM `__hedystia_migrations`");
    expect(after.length).toBe(2);
    expect(after[0].name).toBe("add_age_column");
    expect(after[1].name).toBe("add_score_column");

    await db.close();
  });

  it("should not re-run already applied migrations", async () => {
    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB_MANUAL },
      syncSchemas: true,
      runMigrations: false,
      migrations: [addAgeColumn, addScoreColumn],
      cache: false,
    });

    await db.initialize();
    await db.migrateUp();

    const rows = await db.raw("SELECT name FROM `__hedystia_migrations`");
    expect(rows.length).toBe(2);

    await db.close();
  });
});

describe("migrateDown", () => {
  const cleanup = () => {
    for (const f of [TEST_DB_MANUAL, `${TEST_DB_MANUAL}-shm`, `${TEST_DB_MANUAL}-wal`]) {
      if (existsSync(f)) {
        rmSync(f);
      }
    }
  };

  beforeAll(cleanup);
  afterAll(cleanup);

  it("should rollback the last migration", async () => {
    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB_MANUAL },
      syncSchemas: true,
      runMigrations: false,
      migrations: [addAgeColumn, addScoreColumn],
      cache: false,
    });

    await db.initialize();
    await db.migrateUp();

    const beforeRows = await db.raw("SELECT name FROM `__hedystia_migrations`");
    expect(beforeRows.length).toBe(2);

    const rolledBack = await db.migrateDown();
    expect(rolledBack.length).toBe(1);
    expect(rolledBack[0]).toBe("add_score_column");

    const afterRows = await db.raw("SELECT name FROM `__hedystia_migrations`");
    expect(afterRows.length).toBe(1);
    expect(afterRows[0].name).toBe("add_age_column");

    await db.close();
  });

  it("should rollback multiple migrations with steps", async () => {
    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB_MANUAL },
      syncSchemas: true,
      runMigrations: false,
      migrations: [addAgeColumn, addScoreColumn],
      cache: false,
    });

    await db.initialize();
    await db.migrateUp();

    const rolledBack = await db.migrateDown(2);
    expect(rolledBack.length).toBe(2);
    expect(rolledBack[0]).toBe("add_score_column");
    expect(rolledBack[1]).toBe("add_age_column");

    const rows = await db.raw("SELECT name FROM `__hedystia_migrations`");
    expect(rows.length).toBe(0);

    await db.close();
  });

  it("should return empty array when no migrations to rollback", async () => {
    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB_MANUAL },
      syncSchemas: true,
      runMigrations: false,
      migrations: [addAgeColumn],
      cache: false,
    });

    await db.initialize();

    const rolledBack = await db.migrateDown();
    expect(rolledBack.length).toBe(0);

    await db.close();
  });

  it("should allow re-applying migrations after rollback", async () => {
    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: { filename: TEST_DB_MANUAL },
      syncSchemas: true,
      runMigrations: false,
      migrations: [addAgeColumn, addScoreColumn],
      cache: false,
    });

    await db.initialize();
    await db.migrateUp();
    await db.migrateDown(2);

    const empty = await db.raw("SELECT name FROM `__hedystia_migrations`");
    expect(empty.length).toBe(0);

    await db.migrateUp();

    const reapplied = await db.raw("SELECT name FROM `__hedystia_migrations`");
    expect(reapplied.length).toBe(2);

    await db.close();
  });
});

describe("Connection array selection", () => {
  const cleanup = () => {
    for (const f of [TEST_DB_CONN, `${TEST_DB_CONN}-shm`, `${TEST_DB_CONN}-wal`]) {
      if (existsSync(f)) {
        rmSync(f);
      }
    }
  };

  beforeAll(cleanup);
  afterAll(cleanup);

  it("should pick sqlite config from connection array", async () => {
    const db = database({
      schemas: [users],
      database: "sqlite",
      connection: [
        { filename: TEST_DB_CONN },
        { host: "localhost", port: 3306, user: "root", password: "", database: "test" },
      ],
      syncSchemas: true,
      cache: false,
    });

    await db.initialize();
    expect(existsSync(TEST_DB_CONN)).toBe(true);

    await db.users.insert({ name: "ConnTest", email: "conn@test.com" });
    const found = await db.users.findFirst({ where: { name: "ConnTest" } });
    expect(found).not.toBeNull();
    expect(found!.name).toBe("ConnTest");

    await db.close();
  });
});

describe("WAL checkpoint on disconnect", () => {
  const WAL_DB = "/tmp/hedystia_test_wal.db";
  const cleanup = () => {
    for (const f of [WAL_DB, `${WAL_DB}-shm`, `${WAL_DB}-wal`]) {
      if (existsSync(f)) {
        rmSync(f);
      }
    }
  };

  beforeAll(cleanup);
  afterAll(cleanup);

  it("should persist data after close and reopen", async () => {
    const createTableMigration = migration("create_items", {
      async up({ schema }) {
        schema.createTable(
          table("items", {
            id: integer().primaryKey().autoIncrement(),
            label: varchar(255).notNull(),
          }),
        );
      },
      async down({ schema }) {
        schema.dropTable("items");
      },
    });

    const items = table("items", {
      id: integer().primaryKey().autoIncrement(),
      label: varchar(255).notNull(),
    });

    const db1 = database({
      schemas: [items],
      database: "sqlite",
      connection: { filename: WAL_DB },
      syncSchemas: true,
      runMigrations: true,
      migrations: [createTableMigration],
      cache: false,
    });

    await db1.initialize();
    await db1.items.insert({ label: "persisted" });
    await db1.close();

    const db2 = database({
      schemas: [items],
      database: "sqlite",
      connection: { filename: WAL_DB },
      syncSchemas: true,
      runMigrations: true,
      migrations: [createTableMigration],
      cache: false,
    });

    await db2.initialize();

    const rows = await db2.raw("SELECT name FROM `__hedystia_migrations`");
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("create_items");

    const found = await db2.items.findFirst({ where: { label: "persisted" } });
    expect(found).not.toBeNull();
    expect(found!.label).toBe("persisted");

    await db2.close();
  });
});
