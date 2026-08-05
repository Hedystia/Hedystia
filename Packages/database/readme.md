# @hedystia/db

Type-safe database primitives for SQLite, MySQL, PostgreSQL, JSON files, and
S3-backed storage.

## Install

```bash
pnpm add @hedystia/db
```

Install the driver used by the application separately: `better-sqlite3`,
`sqlite3`, `sql.js`, `mysql2`, `mysql`, `pg`, or `@aws-sdk/client-s3`.

## Schema and typed inserts

```ts
import { database, integer, table, varchar } from "@hedystia/db";

const users = table("users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
});

const db = database({
  schemas: [users],
  database: "sqlite",
  connection: { filename: "./app.db" },
  syncSchemas: true,
});

await db.initialize();
const user = await db.users.insert({ name: "Alice" });
await db.users.insertMany([{ name: "Bob" }, { name: "Cara" }]);
```

`InferInsert<typeof users>` makes auto-increment columns optional while keeping
non-generated columns required. The same insert type is used by repositories,
`insertMany`, and `upsert.create`.

## Queries and migrations

```ts
const rows = await db.users.find({
  where: { name: { like: "%a%" } },
  orderBy: { id: "desc" },
});

const addIndex = migration("users_name_index", {
  async up({ schema }) {
    await schema.addIndex("users", ["name"]);
  },
  async down({ schema }) {
    await schema.dropIndex("users", "users_name_index");
  },
});
```

Each migration is tracked by name and executed inside the driver's transaction
boundary. SQL drivers use native transactions. File and S3 drivers provide a
snapshot-based rollback and remove newly created table artifacts when a
migration fails; storage-level failures should still be monitored because
object storage is not a relational transaction engine.

Migration names must be unique. Indexes are supported by SQLite, MySQL, and
PostgreSQL. File and S3 drivers reject index operations explicitly.

## Drivers

| Driver | Transaction model | Indexes |
| --- | --- | --- |
| SQLite | Native transaction | Yes |
| MySQL/MariaDB | Connection transaction | Yes |
| PostgreSQL | Client transaction | Yes |
| File | In-memory snapshot + flush | No |
| S3 | In-memory snapshot + object flush | No |

## Documentation

- [Database documentation](https://docs.hedystia.com/db/start)
- [Schema](https://docs.hedystia.com/db/schema)
- [Queries](https://docs.hedystia.com/db/queries)
- [Migrations](https://docs.hedystia.com/db/cli)

MIT License © 2026 Hedystia
