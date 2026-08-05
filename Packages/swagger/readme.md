# @hedystia/swagger

OpenAPI 3 documentation for Hedystia applications, including HTTP, WebSocket,
and subscription routes.

## Install

```bash
pnpm add @hedystia/swagger @apidevtools/swagger-parser
```

## Usage

```ts
import { swagger } from "@hedystia/swagger";

const docs = swagger({
  title: "My API",
  version: "1.0.0",
  host: "http://localhost:3000",
});

app.use("/swagger", docs.plugin(app));
```

The plugin exposes:

- `GET /swagger` — generated HTML documentation.
- `GET /swagger/json` — the OpenAPI document.

HTTP route schemas are converted to OpenAPI parameters, request bodies, and
responses. `:id` path parameters become `{id}` according to OpenAPI 3.

## Realtime routes

WebSocket and subscription routes are represented as vendor extensions because
OpenAPI 3 has no native WebSocket operation type:

```json
{
  "/chat": {
    "x-hedystia-websocket": {
      "summary": "WebSocket route /chat"
    }
  },
  "/events": {
    "x-hedystia-subscription": {
      "summary": "SUB /events"
    }
  }
}
```

The extensions are retained in the JSON spec while the HTML renderer lists
HTTP operations as request examples and keeps realtime endpoints visible in
the generated reference.

## Validation

```ts
const valid = await docs.swagger.validate();
```

`validate()` returns `true` when the generated OpenAPI document passes
`@apidevtools/swagger-parser` validation and `false` otherwise.

## Documentation

- [Swagger plugin documentation](https://docs.hedystia.com/plugins/swagger)
- [OpenAPI specification](https://spec.openapis.org/oas/v3.0.3)

MIT License © 2026 Hedystia
