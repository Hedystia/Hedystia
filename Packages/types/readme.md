# @hedystia/types

## Compact route contracts without filesystem writes

`generateTypesContent(routes)` returns a reusable `AppRoutes` declaration; `generateTypes(routes, filePath)` writes the same content. Route paths, property names and string literals are escaped, and subscription `message` schemas are included. Unsupported schema conversions still fall back to `any`.

```sh
npm install @hedystia/types
```

## Usage

```ts
import { generateTypesContent, generateTypes } from "@hedystia/types";
import { h } from "@hedystia/validations";

const routes = [{
  method: "GET",
  path: "/users/:id",
  params: h.object({ id: h.string() }),
  response: h.object({ id: h.string(), name: h.string() }),
}];

const declaration = generateTypesContent(routes);
await generateTypes(routes, "./routes.d.ts");
```

Both APIs emit compact `AppRoutes`: `method` and `path` are always present, while params, query, headers, body, response, data, error and message sections are emitted only when a schema is supplied. Raw `undefined` and `null` mean no schema. Explicit `h.any()`, `h.unknown()`, `h.null()`, `h.undefined()`, `h.void()` and `h.never()` remain declared. Use `schemaToTypeString(schema)` for individual supported Hedystia schemas. Unsupported schemas currently emit `any`; this is not a universal TypeScript schema compiler.

## Compact declarations

```ts
const declaration = generateTypesContent([{ method: "GET", path: "/health" }]);
```

This emits `export type AppRoutes=[{method:"GET";path:"/health"}];` after the generated-file header, with no placeholder `any` fields.

Update `@hedystia/client` alongside regenerated declarations. Missing request sections are absent from typed request options; missing response and error schemas default to `unknown`. Path parameters without a declared schema accept `string | number`. Existing full declarations remain supported, and explicitly declared `any` stays permissive. Unsupported defined schema conversions still fall back to `any` rather than being silently omitted.

For the five-route HTTP fixture, declaration size falls from **783 to 452 bytes (42.27%)**, or **257 to 216 bytes with gzip**. These are generated `.d.ts` bytes, not the browser JavaScript bundle. See the [measurement details](https://docs.hedystia.com/plugins/types#declaration-size-comparison).

[Documentation](https://docs.hedystia.com) · [Source](https://github.com/Hedystia/Hedystia) · MIT
