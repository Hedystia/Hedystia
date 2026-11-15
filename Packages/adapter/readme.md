# @hedystia/adapter

## Keep uploads and streams intact on Node

Node and Vercel handlers consume unread request streams, preserve pre-parsed text/binary/JSON bodies, pipe responses with native backpressure, and forward separate `Set-Cookie` headers. This lets SSE emit before the producer closes and keeps binary uploads intact. Lambda remains a buffered response adapter.

```sh
npm install @hedystia/adapter
```

## Usage

```ts
import { createServer } from "node:http";
import Hedystia from "hedystia";
import { adapter } from "@hedystia/adapter";

const app = new Hedystia().post("/echo", ({ body }) => body);
createServer(adapter(app).toNodeHandler()).listen(3000);
```

Use `toCloudflareWorker()`, `toDeno()`, `toFastlyCompute()`, `toLambda()` or `toVercel()` for their respective entry points. Every adapter accepts an optional `{ prefix: "/api" }`, which prepends the prefix to the incoming path.

Node and Vercel preserve pre-parsed strings and bytes; other parsed values are JSON-serialized. Unparsed IncomingMessage streams are converted using Node's native stream APIs. Outgoing streams use `pipeline`, so destination failures cancel the producer. Node and Vercel log internal failures while returning a generic error body. Lambda responses remain buffered; runtime-specific deployment and event formats still matter.

[Documentation](https://docs.hedystia.com) · [Source](https://github.com/Hedystia/Hedystia) · MIT
