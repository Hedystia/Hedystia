# @hedystia/better-auth

## Auth storage with visible failures

Connect Better Auth to Hedystia DB and generate schemas and migrations. Pagination respects `limit: 0` and rejects negative, fractional or unsafe page bounds. Query failures propagate to the caller instead of looking like an empty account list, so applications can report outages accurately.

```sh
npm install @hedystia/better-auth
```

@hedystia/db adapter for [Better Auth](https://www.better-auth.com/) — use @hedystia/db as your auth database layer.

## Installation

```bash
bun add @hedystia/better-auth @hedystia/db better-auth
```

## Quick Start

1. **Generate schemas and migrations**

```bash
bunx auth generate
# or
npx auth generate
```

This creates `hedystia-db/schemas/` and `hedystia-db/migrations/` directories.

2. **Set up your database**

```typescript
import { database } from "@hedystia/db";
import * as schemas from "./hedystia-db/schemas";
import * as migrations from "./hedystia-db/migrations";

const db = database({
  schemas,
  migrations,
  database: "sqlite",
  connection: { filename: "./auth.db" },
  syncSchemas: true,
  runMigrations: true,
});

await db.initialize();
```

3. **Configure Better Auth**

```typescript
import { betterAuth } from "better-auth";
import { hedystiaAdapter } from "@hedystia/better-auth";
import { organization, twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
  database: hedystiaAdapter(db),
  plugins: [organization(), twoFactor()],
});
```

## Configuration

### Custom Output Directories

```typescript
import { hedystiaAdapter } from "@hedystia/better-auth";

export const auth = betterAuth({
  database: hedystiaAdapter(db, {
    outputDir: "./src/database",
    schemasDir: "./db/schemas",
    migrationsDir: "./db/migrations",
  }),
});
```

**Options:**

- `outputDir` (optional): Base directory for generated files. Default: `"./hedystia-db"`
- `schemasDir` (optional): Directory for schema files. Default: `"{outputDir}/schemas"`
- `migrationsDir` (optional): Directory for migration files. Default: `"{outputDir}/migrations"`

## Features

- 🗄️ **Multi-Database**: Works with all @hedystia/db-supported databases (SQLite, MySQL, File, S3)
- 🔄 **CRUD Operations**: Full support for create, read, update, and delete
- ⚡ **Schema Generation**: Auto-generates @hedystia/db schemas and migrations from Better Auth
- 📦 **Zero-Config Migrations**: Uses @hedystia/db's migration system

## License

MIT
