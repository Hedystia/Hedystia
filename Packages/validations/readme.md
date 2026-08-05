# @hedystia/validations

Type-safe runtime validation for TypeScript APIs with Standard Schema compatibility.

## Install

```bash
pnpm add @hedystia/validations
```

## Define and infer a schema

```ts
import { h, type Infer } from "@hedystia/validations";

const userSchema = h.object({
  id: h.number(),
  name: h.string().minLength(1),
  tags: h.array(h.string()).optional(),
  active: h.default(h.boolean(), true),
});

type User = Infer<typeof userSchema>;
```

Nested object definitions are validated recursively. Validation issues include
nested paths such as `profile.address.city` and array indexes such as `tags.0`.

## Parse and safeParse

```ts
const user = await userSchema.parse(input);
const result = await userSchema.safeParse(input);

if (result.issues) {
  console.error(result.issues);
}
```

Both methods support synchronous and asynchronous schemas. They return a plain
value/result for synchronous validation and a Promise when a child schema,
transform, or refinement is asynchronous. Use `await` when the schema may be
async.

## Defaults and object behavior

`h.default(schema, value)` accepts `undefined` and `null`, supplies the default,
and makes the field optional in inferred input and JSON Schema. Optional fields
are omitted when absent; defaulted fields are materialized in the parsed output.

```ts
const settings = h.object({
  theme: h.default(h.string(), "system"),
  locale: h.string().optional(),
});

await settings.parse({});
// { theme: "system" }
```

Use `.strict()` to reject unknown keys or `.passthrough()` to retain them.

## Standard Schema and JSON Schema

Every schema exposes `~standard`, `parse`, `safeParse`, and `jsonSchema`.
`h.toStandard()` adapts primitive and object definitions to the Standard Schema
interface, while `h.getJsonSchema()` produces a JSON Schema document.

## Common builders

- `h.string()`, `h.number()`, `h.boolean()`, `h.bigint()`
- `h.object()`, `h.array()`, `h.tuple()`, `h.record()`
- `h.map()`, `h.set()`, `h.options()`, `h.discriminatedUnion()`
- `h.default()`, `h.transform()`, `h.refine()`, `h.pipe()`, `h.lazy()`
- `h.coerce.string()`, `h.coerce.number()`, `h.coerce.boolean()`

## Documentation

- [Validation documentation](https://docs.hedystia.com/validations/start)
- [Standard Schema](https://standardschema.dev/)

MIT License © 2026 Hedystia
