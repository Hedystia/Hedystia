import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer, type Server as HttpServer } from "node:http";
import { type ServerWebSocket, WebSocketServer } from "@hedystia/ws";

type CtxData = { id: string; subscribedTopics?: Set<string> };

const PORT = 38961;

let httpServer: HttpServer;
let wss: WebSocketServer<CtxData>;
const openSockets: Array<ServerWebSocket<CtxData>> = [];
const lastMessages: Array<{ id: string; payload: string }> = [];
let lastClosedId: string | null = null;

const baseUrl = `ws://127.0.0.1:${PORT}`;

beforeAll(async () => {
  wss = new WebSocketServer<CtxData>({
    open: (ws) => {
      openSockets.push(ws);
    },
    message: (ws, msg) => {
      const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg as Uint8Array);
      lastMessages.push({ id: ws.data.id, payload: text });

      if (text.startsWith("sub:")) {
        ws.subscribe(text.slice(4));
        ws.send("subscribed");
        return;
      }
      if (text.startsWith("unsub:")) {
        ws.unsubscribe(text.slice(6));
        ws.send("unsubscribed");
        return;
      }
      if (text.startsWith("is-sub:")) {
        ws.send(String(ws.isSubscribed(text.slice(7))));
        return;
      }
      if (text.startsWith("pub-peers:")) {
        const [topic, body] = text.slice("pub-peers:".length).split("|");
        ws.publish(topic!, body!);
        ws.send("peer-published");
        return;
      }
      if (text === "binary") {
        ws.send(new Uint8Array([1, 2, 3, 4]));
        return;
      }
      if (text === "cork") {
        let observed: ServerWebSocket<CtxData> | null = null;
        ws.cork((inner) => {
          observed = inner;
          inner.send("corked");
        });
        ws.send(observed === ws ? "same" : "different");
        return;
      }
      ws.send(`echo:${text}`);
    },
    close: (ws) => {
      lastClosedId = ws.data.id;
    },
  });

  httpServer = createServer((_req, res) => res.end("ok"));
  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const id = url.searchParams.get("id") ?? "anon";
    wss.upgrade({ rawRequest: req, socket, head }, { data: { id } }).catch(() => socket.destroy());
  });

  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
});

afterAll(async () => {
  wss.close(true);
  httpServer.closeAllConnections?.();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connect(id: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl}?id=${id}`);
    ws.onopen = () => resolve(ws);
    ws.onerror = (err) => reject(err);
  });
}

function nextMessage(ws: WebSocket, predicate: (data: string) => boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : (event.data as any).toString();
      if (predicate(data)) {
        ws.removeEventListener("message", onMessage as any);
        resolve(data);
      }
    };
    ws.addEventListener("message", onMessage as any);
    setTimeout(() => reject(new Error("nextMessage timeout")), 1500);
  });
}

describe("WebSocketServer — lifecycle", () => {
  it("invokes open and assigns ws.data on upgrade", async () => {
    const before = openSockets.length;
    const ws = await connect("alpha");

    // small wait for `open` to land
    await new Promise((r) => setTimeout(r, 30));
    expect(openSockets.length).toBe(before + 1);
    expect(openSockets[openSockets.length - 1]!.data.id).toBe("alpha");

    ws.close();
  });

  it("invokes message handler and echoes payloads", async () => {
    const ws = await connect("echoer");
    ws.send("hello");
    const msg = await nextMessage(ws, (d) => d.startsWith("echo:"));
    expect(msg).toBe("echo:hello");
    ws.close();
  });

  it("invokes close handler on disconnect", async () => {
    const ws = await connect("bye");
    lastClosedId = null;
    ws.close();
    await new Promise((r) => setTimeout(r, 80));
    expect(lastClosedId as string | null).toBe("bye");
  });
});

describe("WebSocketServer — subscriptions", () => {
  it("subscribe + isSubscribed + unsubscribe", async () => {
    const ws = await connect("sub-1");

    ws.send("sub:room-a");
    await nextMessage(ws, (d) => d === "subscribed");

    ws.send("is-sub:room-a");
    expect(await nextMessage(ws, (d) => d === "true" || d === "false")).toBe("true");

    ws.send("unsub:room-a");
    await nextMessage(ws, (d) => d === "unsubscribed");

    ws.send("is-sub:room-a");
    expect(await nextMessage(ws, (d) => d === "true" || d === "false")).toBe("false");

    ws.close();
  });
});

describe("WebSocketServer — pub/sub", () => {
  it("ws.publish() broadcasts to peers excluding self", async () => {
    const a = await connect("pub-a");
    const b = await connect("pub-b");
    const c = await connect("pub-c");

    for (const ws of [a, b, c]) {
      ws.send("sub:room-x");
      await nextMessage(ws, (d) => d === "subscribed");
    }

    a.send("pub-peers:room-x|hello-from-a");
    const ackA = await nextMessage(a, (d) => d === "peer-published");
    expect(ackA).toBe("peer-published");

    const heardByB = await nextMessage(b, (d) => d === "hello-from-a");
    const heardByC = await nextMessage(c, (d) => d === "hello-from-a");
    expect(heardByB).toBe("hello-from-a");
    expect(heardByC).toBe("hello-from-a");

    a.close();
    b.close();
    c.close();
  });

  it("server.publish() returns the count of receivers", async () => {
    const a = await connect("srvpub-a");
    const b = await connect("srvpub-b");

    for (const ws of [a, b]) {
      ws.send("sub:room-y");
      await nextMessage(ws, (d) => d === "subscribed");
    }

    const count = wss.publish("room-y", "broadcast");
    expect(count).toBe(2);

    expect(await nextMessage(a, (d) => d === "broadcast")).toBe("broadcast");
    expect(await nextMessage(b, (d) => d === "broadcast")).toBe("broadcast");

    a.close();
    b.close();
  });

  it("server.publish() returns 0 for unknown topics", () => {
    expect(wss.publish("never-subscribed", "x")).toBe(0);
  });

  it("publish skips closed sockets and cleans on close", async () => {
    const a = await connect("clean-a");
    const b = await connect("clean-b");

    for (const ws of [a, b]) {
      ws.send("sub:room-z");
      await nextMessage(ws, (d) => d === "subscribed");
    }

    a.close();
    await new Promise((r) => setTimeout(r, 100));

    const count = wss.publish("room-z", "after-close");
    expect(count).toBe(1);

    expect(await nextMessage(b, (d) => d === "after-close")).toBe("after-close");
    b.close();
  });
});

describe("WebSocketServer — payload kinds", () => {
  it("send() accepts binary payloads", async () => {
    const ws = await connect("binary");
    const got: number[] = await new Promise((resolve, reject) => {
      ws.binaryType = "arraybuffer";
      ws.addEventListener("message", (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          resolve(Array.from(new Uint8Array(event.data)));
        } else if (typeof event.data !== "string") {
          resolve(Array.from(new Uint8Array((event.data as Buffer).buffer)));
        }
      });
      ws.addEventListener("error", reject as any);
      ws.send("binary");
      setTimeout(() => reject(new Error("binary timeout")), 1000);
    });

    expect(got).toEqual([1, 2, 3, 4]);
    ws.close();
  });

  it("cork() invokes the callback synchronously with the same socket", async () => {
    const ws = await connect("corker");
    ws.send("cork");

    const corked = await nextMessage(ws, (d) => d === "corked");
    const sameness = await nextMessage(ws, (d) => d === "same" || d === "different");
    expect(corked).toBe("corked");
    expect(sameness).toBe("same");

    ws.close();
  });
});
