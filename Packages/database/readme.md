# @hedystia/db

Next-gen TypeScript ORM for building type-safe database layers at lightspeed. Focused on performance, developer experience, and multi-driver flexibility.

## Features

- 💎 **Type-safe by Design**: First-class TypeScript inference for all your queries.
- 🚀 **Multi-Driver Support**: Native drivers for SQLite, MySQL, PostgreSQL, and experimental support for File/S3 storage.
- ⚡ **Auto-Mapping**: Decouple database table/column names from your TypeScript models.
- 🔗 **Smart Relations**: Define relationships once and load them eagerly with intuitive `with` queries.
- 📦 **Zero-Config Migrations**: CLI for generating atomic migrations and schema synchronization.
- 🧠 **Built-in Caching**: Adaptive TTL caching with automatic invalidation on writes.

## Installation

```bash
bun add @hedystia/db
```

### Choose your Driver

| Database | Driver Package | Command |
| --- | --- | --- |
| **SQLite** | `better-sqlite3`, `sqlite3`, `sql.js` | `bun add better-sqlite3` |
| **MySQL** | `mysql2` or `mysql` | `bun add mysql2` |
| **PostgreSQL** | `pg` | `bun add pg` |
| **S3** | `@aws-sdk/client-s3` | `bun add @aws-sdk/client-s3` |
| **File** | *Built-in* | *No installation needed* |
| **Edge** | `bun:sqlite` (Bun only) | *No installation needed* |


---

## Quick Start

### Define your Schema

Define your tables using the `table` function. This allows you to map database properties to your preferred TypeScript keys.

```typescript
import { table, integer, varchar, text } from "@hedystia/db";

export const users = table("example_users", {
  id: integer().primaryKey().autoIncrement(),
  fullName: varchar(255).name("full_name").notNull(),
  email: varchar(255).unique(),
});

export const posts = table("example_posts", {
  id: integer().primaryKey().autoIncrement(),
  authorId: integer().name("author_id").references(() => users.id),
  title: varchar(255).notNull(),
  body: text(),
});
```

### Initialize the Database

Use the **Object Schema** method (recommended) to automatically alias your tables on the database instance.

```typescript
import { database } from "@hedystia/db";
import { users, posts } from "./schema";

const db = database({
  schemas: { users, posts }, // Alias tables as db.users and db.posts
  database: "sqlite",
  connection: { filename: "./main.db" },
  syncSchemas: true, // Auto-create tables during development
});

await db.initialize();
```

### Query your Data

```typescript
// Insert a record
const newUser = await db.users.insert({ 
  fullName: "Alice Vance", 
  email: "alice@hedystia.com" 
});

// Find with eager relations
const userWithPosts = await db.users.findFirst({
  where: { fullName: "Alice Vance" },
  with: { posts: true }
});

// Powerful filtering
const recentPosts = await db.posts.find({
  where: { authorId: 1, title: { like: "%Hedystia%" } },
  orderBy: { id: "desc" },
  take: 5
});
```

## Advanced Usage

Explore our detailed documentation for advanced topics:

- [**Schema Definition**](https://docs.hedystia.com/db/schema) - Custom types, constraints, and aliases.
- [**Relations**](https://docs.hedystia.com/db/relations) - One-to-many, many-to-one, and cascade behaviors.
- [**Queries**](https://docs.hedystia.com/db/queries) - Full API reference for find, insert, update, and delete.
- [**CLI & Migrations**](https://docs.hedystia.com/db/cli) - Managing schema changes safely.
- [**Drivers**](https://docs.hedystia.com/db/drivers/sqlite) - Specific configuration for MySQL, PostgreSQL, SQLite, S3, and more.

## Community & Links

- [Documentation](https://docs.hedystia.com/db/start)
- [GitHub](https://github.com/Hedystia/Hedystia)
- [Discord](https://hedystia.com/discord)
