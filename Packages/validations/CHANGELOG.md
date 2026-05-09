# `@hedystia/validations` — Changelog

**File responsibilities**

| File | Contents |
|------|----------|
| `core/types.ts` | `Schema`, `Infer`, `InferInput`, `InferOutput`, `InferSchema`, `InferObject`, `AnySchema`, `SchemaDefinition`, `SchemaPrimitive`, `SchemaPrimitiveMap`, `CombinedStandardProps`, `Simplify`, `RequiredKeys`, `OptionalKeys`, `SchemaType` |
| `core/base.ts` | `BaseSchema`, `OptionalSchema`, `NullSchemaType`, `LiteralSchema`, `UnionSchema`, `ArraySchema`, `InstanceOfSchema`, `validatePrimitive` |
| `to-standard.ts` | `toStandard`, `getJsonSchema` |
| `h.ts` | `h` factory builder |
| `index.ts` | Re-exports everything |

---

### ✨ New `h` factories

| API | Description |
|-----|-------------|
| `h.bigint()` | bigint schema with `.min(b)` / `.max(b)` / `.coerce()` |
| `h.undefined()` | accepts only `undefined` |
| `h.void()` | `void` type |
| `h.unknown()` | accepts anything, typed as `unknown` (vs `any`) |
| `h.never()` | always fails validation |
| `h.tuple(a, b, ...)` | fixed-length positional array; `.rest_(s)` for trailing items |
| `h.record(v)` | object with dynamic string keys → `v` |
| `h.record(k, v)` | object with key schema `k` and value schema `v` |
| `h.map(k, v)` | native `Map<K, V>` |
| `h.set(v)` | native `Set<V>` |
| `h.intersection(a, b, ...)` | `allOf` with deep-merge of object outputs |
| `h.discriminatedUnion(d, [...])` | tagged union with O(1) discriminator lookup |
| `h.lazy(() => schema)` | recursive schemas |
| `h.default(schema, v \| fn)` | default when input is `undefined`/`null` |
| `h.transform(schema, fn)` | post-process the validated value |
| `h.refine(schema, check, msg?)` | predicate returning `true \| false \| string \| Issue[]` |
| `h.pipe(a, b)` | chain `a → b` |
| `h.union(...schemas)` | alias of `h.options` |
| `h.coerce.string()` | shortcut for `h.string().coerce()` |
| `h.coerce.number()` | shortcut for `h.number().coerce()` |
| `h.coerce.boolean()` | shortcut for `h.boolean().coerce()` |
| `h.coerce.bigint()` | shortcut for `h.bigint().coerce()` |

---

### 🔧 Improvements to existing schemas

| Schema | New methods |
|--------|-------------|
| `NumberSchemaType` | `.int()` |
| `ArraySchema` | `.min(n)`, `.max(n)`, `.nonEmpty()` |
| `ObjectSchemaType` | `.strict()`, `.passthrough()`, `.extend(def)`, `.merge(other)`, `.pick(keys)`, `.omit(keys)`, `.partial()` |

---

### 📦 Public API additions

| Kind | Names |
|------|-------|
| Types | `Infer`, `InferInput`, `InferOutput`, `RefineCheck` |
| Classes | `AnySchemaType`, `UnknownSchemaType`, `NeverSchemaType`, `UndefinedSchemaType`, `VoidSchemaType`, `BigIntSchemaType`, `TupleSchema`, `RecordSchema`, `IntersectionSchema`, `DiscriminatedUnionSchema`, `MapSchema`, `SetSchema`, `LazySchema`, `DefaultSchema`, `TransformSchema`, `PipeSchema`, `RefineSchema` |
| Functions | `getJsonSchema`, `toStandard` |
