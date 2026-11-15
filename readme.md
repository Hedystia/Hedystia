<div align="center">
  <p>
    <strong>🚀 Hedystia</strong>
  </p>

  <p>
    <strong>A complete TypeScript ecosystem — server, ORM, reactive UI, validations, and more. ⚡</strong>
  </p>

  <p>
    <a href="https://docs.hedystia.com"><img src="https://img.shields.io/badge/Docs-blue?style=flat-square" alt="Documentation"></a>
    <a href="https://www.npmjs.com/package/hedystia"><img src="https://img.shields.io/npm/v/hedystia.svg?style=flat-square" alt="npm version"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/Hedystia/Hedystia.svg?style=flat-square" alt="license"></a>
    <img src="https://img.shields.io/badge/Bun-powered-FFD43B?style=flat-square&logo=bun" alt="Bun powered">
  </p>
</div>

## 📦 Packages

| Package | npm | Monthly downloads | Description |
|---------|-----|-------------------|-------------|
| [`hedystia`](./Packages/server) | [![npm](https://img.shields.io/npm/v/hedystia.svg?style=flat-square)](https://www.npmjs.com/package/hedystia) | [![Monthly downloads](https://img.shields.io/npm/dm/hedystia?style=flat-square)](https://www.npmjs.com/package/hedystia) | Core HTTP server framework with full type safety, WebSocket, SSE, middleware, hooks and macros |
| [`@hedystia/validations`](./Packages/validations) | [![npm](https://img.shields.io/npm/v/@hedystia/validations.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/validations) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fvalidations?style=flat-square)](https://www.npmjs.com/package/@hedystia/validations) | Schema validation system — Standard Schema v1 compliant, interoperable with Zod, ArkType, etc. |
| [`@hedystia/db`](./Packages/database) | [![npm](https://img.shields.io/npm/v/@hedystia/db.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/db) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fdb?style=flat-square)](https://www.npmjs.com/package/@hedystia/db) | Type-safe ORM with schema-first design, migrations, caching, and multi-driver support (MySQL, SQLite, S3) |
| [`@hedystia/view`](./Packages/view) | [![npm](https://img.shields.io/npm/v/@hedystia/view.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/view) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fview?style=flat-square)](https://www.npmjs.com/package/@hedystia/view) | Reactive UI engine — fine-grained signals, no Virtual DOM, JSX, SSR, and control flow primitives |
| [`@hedystia/client`](./Packages/client) | [![npm](https://img.shields.io/npm/v/@hedystia/client.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/client) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fclient?style=flat-square)](https://www.npmjs.com/package/@hedystia/client) | Auto-generated type-safe HTTP client with path chaining, SSE and WebSocket support |
| [`@hedystia/router`](./Packages/router) | [![npm](https://img.shields.io/npm/v/@hedystia/router.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/router) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Frouter?style=flat-square)](https://www.npmjs.com/package/@hedystia/router) | Typed nested routes, lazy file generation, cached loaders and native View Transitions |
| [`@hedystia/query`](./Packages/query) | [![npm](https://img.shields.io/npm/v/@hedystia/query.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/query) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fquery?style=flat-square)](https://www.npmjs.com/package/@hedystia/query) | Reactive query caching, shared requests and mutation invalidation using View primitives |
| [`@hedystia/adapter`](./Packages/adapter) | [![npm](https://img.shields.io/npm/v/@hedystia/adapter.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/adapter) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fadapter?style=flat-square)](https://www.npmjs.com/package/@hedystia/adapter) | Multi-runtime adapters — Cloudflare Workers, Node.js, Deno, Lambda, Vercel, Fastly Compute |
| [`@hedystia/swagger`](./Packages/swagger) | [![npm](https://img.shields.io/npm/v/@hedystia/swagger.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/swagger) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fswagger?style=flat-square)](https://www.npmjs.com/package/@hedystia/swagger) | OpenAPI/Swagger documentation auto-generated from your routes |
| [`@hedystia/types`](./Packages/types) | [![npm](https://img.shields.io/npm/v/@hedystia/types.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/types) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Ftypes?style=flat-square)](https://www.npmjs.com/package/@hedystia/types) | Route type generation utility for end-to-end type safety |
| [`@hedystia/ws`](./Packages/websocket) | [![npm](https://img.shields.io/npm/v/@hedystia/ws.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/ws) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fws?style=flat-square)](https://www.npmjs.com/package/@hedystia/ws) | Universal WebSocket primitives — server, client, runtime detection |

### Integrations

| Package | npm | Monthly downloads | Description |
|---------|-----|-------------------|-------------|
| [`@hedystia/astro`](./Packages/integrations/view/astro) | [![npm](https://img.shields.io/npm/v/@hedystia/astro.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/astro) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fastro?style=flat-square)](https://www.npmjs.com/package/@hedystia/astro) | Astro integration for `@hedystia/view` components |
| [`@hedystia/better-auth`](./Packages/integrations/database/better-auth) | [![npm](https://img.shields.io/npm/v/@hedystia/better-auth.svg?style=flat-square)](https://www.npmjs.com/package/@hedystia/better-auth) | [![Monthly downloads](https://img.shields.io/npm/dm/@hedystia%2Fbetter-auth?style=flat-square)](https://www.npmjs.com/package/@hedystia/better-auth) | Better Auth adapter for `@hedystia/db` |

Monthly download badges use public npm statistics through Shields.io; they require no repository workflows. New packages may show unavailable statistics until npm has download data.

## Why choose each package?

| Package | A practical reason to install it |
| --- | --- |
| [`hedystia`](./Packages/server) | Test the contract beside the route. |
| [`@hedystia/client`](./Packages/client) | A typed client you can test without a server. |
| [`@hedystia/router`](./Packages/router) | Typed navigation and generated lazy routes with shared loader caching. |
| [`@hedystia/query`](./Packages/query) | Shared reactive queries with independent cancellation and explicit invalidation. |
| [`@hedystia/validations`](./Packages/validations) | Reuse schemas without losing field types. |
| [`@hedystia/db`](./Packages/database) | One schema, explicit storage choices. |
| [`@hedystia/view`](./Packages/view) | Static HTML with explicit reactive islands and race-safe resources. |
| [`@hedystia/adapter`](./Packages/adapter) | Keep uploads and streams intact on Node. |
| [`@hedystia/swagger`](./Packages/swagger) | Documentation from the route contract. |
| [`@hedystia/types`](./Packages/types) | Generate route contracts without filesystem writes. |
| [`@hedystia/ws`](./Packages/websocket) | Native sockets with binary and queue controls. |
| [`@hedystia/astro`](./Packages/integrations/view/astro) | Small reactive islands in Astro. |
| [`@hedystia/better-auth`](./Packages/integrations/database/better-auth) | Auth storage with visible failures. |

See the package READMEs for examples, limits and installation commands.

## 🚀 Quick Start

### Server

```bash
bun add hedystia
```

```typescript
import { Hedystia, h } from "hedystia";

const app = new Hedystia()
  .get("/hello/:name", (ctx) => `Hello ${ctx.params.name}!`, {
    params: h.object({ name: h.string() }),
    response: h.string()
  })
  .listen(3000);
```

### Type-safe Client

```bash
bun add @hedystia/client
```

```typescript
import { createClient } from "@hedystia/client";

const client = createClient<typeof app>("http://localhost:3000");

const { data } = await client.hello.name("World").get();
console.log(data); // "Hello World!"
```

### Database (ORM)

```bash
bun add @hedystia/db
```

```typescript
import { table, integer, varchar, text } from "@hedystia/db";

// Define your schema
const users = table("example_users", {
  id: integer().primaryKey().autoIncrement(),
  fullName: varchar(255).name("full_name").notNull(),
  email: varchar(255).unique(),
});

const posts = table("example_posts", {
  id: integer().primaryKey().autoIncrement(),
  authorId: integer().name("author_id").references(() => users.id),
  title: varchar(255).notNull(),
  body: text(),
});
```

```typescript
import { database } from "@hedystia/db";
import { users, posts } from "./schema";

// Initialize with object schema (recommended)
const db = database({
  schemas: { users, posts },
  database: "sqlite",
  connection: { filename: "./main.db" },
  syncSchemas: true, // Auto-create tables in development
});

await db.initialize();

// Query data
const newUser = await db.users.insert({ 
  fullName: "Alice Vance", 
  email: "alice@hedystia.com" 
});

const userWithPosts = await db.users.findFirst({
  where: { fullName: "Alice Vance" },
  with: { posts: true }
});
```

### Reactive UI (View)

```bash
bun add @hedystia/view
```

Configure your `tsconfig.json`:
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@hedystia/view"
  }
}
```

```tsx
import { sig, val, set, mount } from "@hedystia/view";

function Counter() {
  const count = sig(0);
  return (
    <div>
      <h1>Counter: {() => val(count)}</h1>
      <button onClick={() => set(count, val(count) + 1)}>+</button>
    </div>
  );
}

mount(Counter, document.getElementById("root")!);
```

> Components run **once**. Reactivity comes from wrapping signal reads in `() => ...` accessors.

### Validations

```bash
bun add @hedystia/validations
```

```typescript
import { h, Infer } from "@hedystia/validations";

const userSchema = h.object({
  id: h.number(),
  name: h.string(),
  email: h.string().email(),
  tags: h.string().array().optional()
});

// Type inference
type User = Infer<typeof userSchema>;
/*
{
  id: number;
  name: string;
  email: string;
  tags?: string[] | undefined;
}
*/

// Standard Schema v1 compliant — works with Zod, ArkType, etc.
```

### Swagger

```typescript
import { swagger } from "@hedystia/swagger";

const swaggerPlugin = swagger({
  title: "My API",
  description: "An example API with Swagger",
  version: "1.0.0",
  tags: [
    { name: "users", description: "User operations" },
  ],
});

app.use("/swagger", swaggerPlugin.plugin(app));
```

### Multi-runtime Adapters

```typescript
import { adapter } from "@hedystia/adapter";

// Deploy anywhere
adapter(app).toCloudflareWorker();
adapter(app).toNodeHandler();
adapter(app).toDeno();
adapter(app).toLambda();
adapter(app).toVercel();
adapter(app).toFastlyCompute();
```

## 📜 License

MIT License © 2026 Hedystia

## 📖 Documentation

- [Full Documentation](https://docs.hedystia.com)
- [Getting Started Guide](https://docs.hedystia.com/framework/getting-started)
- [API Reference](https://docs.hedystia.com/framework/overview)

## 🗣️ Community

- [GitHub Issues](https://github.com/Hedystia/Hedystia/issues)
- [Discord Server](https://hedystia.com/support)
