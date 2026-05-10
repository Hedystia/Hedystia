import {
  array,
  bigint,
  blob,
  boolean,
  char,
  database,
  datetime,
  decimal,
  float,
  integer,
  json,
  table,
  text,
  timestamp,
  varchar,
} from "@hedystia/db";
import { existsSync, rmSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const allTypes = table("all_types", {
  id: integer().primaryKey().autoIncrement(),
  intCol: integer().default(0),
  bigintCol: bigint().default(0),
  varcharCol: varchar(255),
  charCol: char(36),
  textCol: text(),
  boolCol: boolean().default(false),
  jsonCol: json(),
  arrayCol: array(),
  datetimeCol: datetime(),
  timestampCol: timestamp(),
  decimalCol: decimal(10, 2),
  floatCol: float(),
  blobCol: blob(),
});

function runColumnTypeTests(
  _driverName: string,
  getDb: () => ReturnType<typeof database<{ allTypes: typeof allTypes }>>,
  getInitialized: () => boolean,
) {
  const db = getDb();
  const initialized = getInitialized;

  it("should insert and retrieve integer", async () => {
    if (!initialized()) {
      return;
    }
    const row = await db.allTypes.insert({ intCol: 42 });
    expect(row.intCol).toBe(42);
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.intCol).toBe(42);
  });

  it("should insert and retrieve bigint", async () => {
    if (!initialized()) {
      return;
    }
    const row = await db.allTypes.insert({ bigintCol: 9999999 });
    expect(row.bigintCol).toBe(9999999);
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.bigintCol).toBe(9999999);
  });

  it("should insert and retrieve varchar", async () => {
    if (!initialized()) {
      return;
    }
    const row = await db.allTypes.insert({ varcharCol: "hello" });
    expect(row.varcharCol).toBe("hello");
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.varcharCol).toBe("hello");
  });

  it("should insert and retrieve char", async () => {
    if (!initialized()) {
      return;
    }
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const row = await db.allTypes.insert({ charCol: uuid });
    expect(row.charCol).toBe(uuid);
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.charCol).toBe(uuid);
  });

  it("should insert and retrieve text", async () => {
    if (!initialized()) {
      return;
    }
    const longText = "Lorem ipsum dolor sit amet ".repeat(100);
    const row = await db.allTypes.insert({ textCol: longText });
    expect(row.textCol).toBe(longText);
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.textCol).toBe(longText);
  });

  it("should insert and retrieve boolean", async () => {
    if (!initialized()) {
      return;
    }
    const row = await db.allTypes.insert({ boolCol: true });
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.boolCol).toBeTruthy();
  });

  it("should insert and retrieve json", async () => {
    if (!initialized()) {
      return;
    }
    const data = { key: "value", nested: { a: 1 } };
    const row = await db.allTypes.insert({ jsonCol: data });
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.jsonCol).toEqual(data);
  });

  it("should insert and retrieve array", async () => {
    if (!initialized()) {
      return;
    }
    const data = [1, "two", true];
    const row = await db.allTypes.insert({ arrayCol: data });
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.arrayCol).toEqual(data);
  });

  it("should insert and retrieve datetime as Date", async () => {
    if (!initialized()) {
      return;
    }
    const now = new Date("2025-06-15T12:30:00.000Z");
    const row = await db.allTypes.insert({ datetimeCol: now });
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.datetimeCol).toBeInstanceOf(Date);
    expect(found!.datetimeCol!.getFullYear()).toBe(2025);
  });

  it("should insert and retrieve timestamp as Date", async () => {
    if (!initialized()) {
      return;
    }
    const now = new Date("2025-06-15T14:00:00.000Z");
    const row = await db.allTypes.insert({ timestampCol: now });
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.timestampCol).toBeInstanceOf(Date);
    expect(found!.timestampCol!.getFullYear()).toBe(2025);
  });

  it("should insert and retrieve decimal", async () => {
    if (!initialized()) {
      return;
    }
    const row = await db.allTypes.insert({ decimalCol: 123.45 });
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.decimalCol).toBeCloseTo(123.45, 1);
  });

  it("should insert and retrieve float", async () => {
    if (!initialized()) {
      return;
    }
    const row = await db.allTypes.insert({ floatCol: 3.14 });
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.floatCol).toBeCloseTo(3.14, 1);
  });

  it("should insert and retrieve blob", async () => {
    if (!initialized()) {
      return;
    }
    const data = Buffer.from("binary data");
    const row = await db.allTypes.insert({ blobCol: data });
    const found = await db.allTypes.findFirst({ where: { id: row.id } });
    expect(found!.blobCol).toBeDefined();
  });
}

// ── SQLite providers ──

const SQLITE_DB = "/tmp/hedystia_test_column_types.db";
const sqliteProviders = ["better-sqlite3", "bun:sqlite"] as const;

for (const provider of sqliteProviders) {
  describe(`Column Types - SQLite (${provider})`, () => {
    let initialized = false;

    const db = database({
      schemas: { allTypes },
      database: { name: "sqlite", provider },
      connection: { filename: SQLITE_DB },
      syncSchemas: true,
      cache: false,
    });

    beforeAll(async () => {
      if (provider === "bun:sqlite" && !process.versions.bun) {
        return;
      }
      if (existsSync(SQLITE_DB)) {
        rmSync(SQLITE_DB);
      }
      try {
        await db.initialize();
        initialized = true;
      } catch (err: any) {
        if (
          err.message.includes("better-sqlite3") ||
          err.message.includes("bun:sqlite") ||
          err.message.includes("bindings")
        ) {
          return;
        }
        throw err;
      }
    });

    afterAll(async () => {
      try {
        if (initialized) {
          await db.close();
        }
      } catch {}
      if (existsSync(SQLITE_DB)) {
        rmSync(SQLITE_DB);
      }
    });

    runColumnTypeTests(
      `sqlite-${provider}`,
      () => db,
      () => initialized,
    );
  });
}

// ── File driver ──

const FILE_DIR = "/tmp/hedystia_test_column_types_file";

describe("Column Types - File", () => {
  let initialized = false;

  const db = database({
    schemas: { allTypes },
    database: "file",
    connection: { directory: FILE_DIR },
    syncSchemas: true,
    cache: false,
  });

  beforeAll(async () => {
    if (existsSync(FILE_DIR)) {
      rmSync(FILE_DIR, { recursive: true });
    }
    await db.initialize();
    initialized = true;
  });

  afterAll(async () => {
    try {
      if (initialized) {
        await db.close();
      }
    } catch {}
    if (existsSync(FILE_DIR)) {
      rmSync(FILE_DIR, { recursive: true });
    }
  });

  runColumnTypeTests(
    "file",
    () => db,
    () => initialized,
  );
});

// ── MySQL drivers ──

const mysqlConfigs = [
  { name: "mysql", provider: "mysql2" },
  { name: "mysql", provider: "mysql" },
] as const;

for (const config of mysqlConfigs) {
  describe(`Column Types - MySQL (${config.provider})`, () => {
    let initialized = false;

    const db = database({
      schemas: { allTypes },
      database: config,
      connection: {
        host: process.env.MYSQL_HOST ?? "localhost",
        port: Number(process.env.MYSQL_PORT ?? 3306),
        user: process.env.MYSQL_USER ?? "root",
        password: process.env.MYSQL_PASSWORD ?? "",
        database: process.env.MYSQL_DATABASE ?? "hedystia_test",
      },
      syncSchemas: true,
      cache: false,
    });

    beforeAll(async () => {
      try {
        await db.initialize();
        initialized = true;
        await db.allTypes.truncate();
      } catch (err: any) {
        console.warn(`MySQL (${config.provider}) column-types skipped:`, err.message);
      }
    });

    afterAll(async () => {
      try {
        if (initialized) {
          await db.raw("DROP TABLE IF EXISTS `all_types`");
          await db.close();
        }
      } catch {}
    });

    runColumnTypeTests(
      `mysql-${config.provider}`,
      () => db,
      () => initialized,
    );
  });
}

// ── S3 driver ──

describe("Column Types - S3", () => {
  let initialized = false;

  const db = database({
    schemas: { allTypes },
    database: "s3",
    connection: {
      bucket: "hedystia-test-coltypes",
      endpoint: process.env.S3_URL || "http://localhost:9090",
      region: "us-east-1",
      accessKeyId: process.env.S3_KEY_ID || "admin",
      secretAccessKey: process.env.S3_ACCESS_KEY || "password",
      prefix: "col-types",
    },
    syncSchemas: true,
    cache: false,
  });

  beforeAll(async () => {
    try {
      await db.initialize();
      initialized = true;
    } catch (err: any) {
      console.warn("S3 column-types skipped:", err.message);
    }
  }, 30000);

  afterAll(async () => {
    try {
      if (initialized) {
        await db.close();
      }
    } catch {}
  });

  runColumnTypeTests(
    "s3",
    () => db,
    () => initialized,
  );
});
