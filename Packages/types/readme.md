# @hedystia/types

## Generate route contracts without filesystem writes

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

Both APIs emit `AppRoutes`, including params, query, headers, body, response, data, error and message sections. Use `schemaToTypeString(schema)` for individual supported Hedystia schemas. Unsupported schemas currently emit `any`; this is not a universal TypeScript schema compiler.

[Documentation](https://docs.hedystia.com) · [Source](https://github.com/Hedystia/Hedystia) · MIT
