import type { ServeInfo, ServerWebSocket } from "@hedystia/ws";
import { serve } from "@hedystia/ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let PORT = 0;
let baseUrl = "";

type CtxData = { id: string };

let server: ServeInfo;
const openSockets: ServerWebSocket<CtxData>[] = [];
let lastClosedId: string | null = null;

beforeAll(async () => {
  server = await serve<CtxData>(
    {
      open: (ws) => {
        openSockets.push(ws);
      },
      message: (ws, message) => {
        const text = typeof message === "string" ? message : Buffer.from(message as any).toString();

        if (text.startsWith("sub:")) {
          const topic = text.slice(4);
          ws.subscribe(topic);
          ws.send("subscribed");
          return;
        }

        if (text.startsWith("pub-peers:")) {
          const [topic, msg] = text.slice(10).split("|");
          ws.publish(topic!, msg!);
          ws.send("peer-published");
          return;
        }

        if (text.startsWith("pub-all:")) {
          const [topic, msg] = text.slice(8).split("|");
          const count = server.publish(topic!, msg!);
          ws.send(`published:${count}`);
          return;
        }

        if (text.startsWith("is-sub:")) {
          ws.send(ws.isSubscribed(text.slice(7)) ? "true" : "false");
          return;
        }

        if (text === "unsub:all") {
          ws.unsubscribe("room-a");
          ws.send("unsubscribed");
          return;
        }

        if (text === "binary") {
          ws.send(new Uint8Array([1, 2, 3, 4]), true);
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
        const idx = openSockets.indexOf(ws);
        if (idx !== -1) {
          openSockets.splice(idx, 1);
        }
      },
    },
    {
      port: 0,
      resolveData: (req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        return { id: url.searchParams.get("id") || "unknown" };
      },
    },
  );

  PORT = server.port;
  baseUrl = `ws://127.0.0.1:${PORT}`;
});

afterAll(async () => {
  await server.stop(true);
});

function connect(id: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl}?id=${id}`);
    ws.onopen = () => resolve(ws);
    ws.onerror = (err) => reject(err);
  });
}

function collectMessages(ws: WebSocket) {
  const messages: string[] = [];
  ws.onmessage = (event) => {
    messages.push(typeof event.data === "string" ? event.data : event.data.toString());
  };
  return messages;
}

async function waitFor(predicate: () => boolean, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Timeout waiting for predicate");
}

describe("WebSocketServer — lifecycle", () => {
  it("invokes open and assigns ws.data on upgrade", async () => {
    const before = openSockets.length;
    const ws = await connect("alpha");

    await new Promise((r) => setTimeout(r, 50));
    expect(openSockets.length).toBe(before + 1);
    expect(openSockets[openSockets.length - 1]!.data.id).toBe("alpha");

    ws.close();
  });

  it("invokes message handler and echoes payloads", async () => {
    const ws = await connect("echoer");
    const msgs = collectMessages(ws);
    ws.send("hello");
    await waitFor(() => msgs.some((m) => m === "echo:hello"));
    expect(msgs).toContain("echo:hello");
    ws.close();
  });

  it("invokes close handler on disconnect", async () => {
    const ws = await connect("bye");
    lastClosedId = null;
    ws.close();
    await waitFor(() => lastClosedId === "bye");
    expect(lastClosedId).toBe("bye");
  });
});

describe("WebSocketServer — subscriptions", () => {
  it("subscribe + isSubscribed + unsubscribe", async () => {
    const ws = await connect("sub-1");
    const msgs = collectMessages(ws);

    ws.send("sub:room-a");
    await waitFor(() => msgs.includes("subscribed"));

    ws.send("is-sub:room-a");
    await waitFor(() => msgs.includes("true"));

    ws.send("unsub:all");
    await waitFor(() => msgs.includes("unsubscribed"));

    ws.send("is-sub:room-a");
    await waitFor(() => msgs.includes("false"));

    ws.close();
  });
});

describe("WebSocketServer — pub/sub", () => {
  it("ws.publish() broadcasts to peers excluding self", async () => {
    const a = await connect("pub-a");
    const b = await connect("pub-b");
    const c = await connect("pub-c");

    const msgsA = collectMessages(a);
    const msgsB = collectMessages(b);
    const msgsC = collectMessages(c);

    for (const [ws, msgs] of [
      [a, msgsA],
      [b, msgsB],
      [c, msgsC],
    ] as [WebSocket, string[]][]) {
      ws.send("sub:room-x");
      await waitFor(() => msgs.includes("subscribed"));
    }

    a.send("pub-peers:room-x|hello-from-a");
    await waitFor(() => msgsB.includes("hello-from-a"));
    await waitFor(() => msgsC.includes("hello-from-a"));
    expect(msgsB).toContain("hello-from-a");
    expect(msgsC).toContain("hello-from-a");
    expect(msgsA).not.toContain("hello-from-a");

    a.close();
    b.close();
    c.close();
  }, 20000);

  it("server.publish() returns the count of receivers", async () => {
    const a = await connect("srvpub-a");
    const b = await connect("srvpub-b");
    const c = await connect("srvpub-c");

    const msgsA = collectMessages(a);
    const msgsB = collectMessages(b);
    const msgsC = collectMessages(c);

    for (const [ws, msgs] of [
      [a, msgsA],
      [b, msgsB],
      [c, msgsC],
    ] as [WebSocket, string[]][]) {
      ws.send("sub:count-test");
      await waitFor(() => msgs.includes("subscribed"));
    }

    a.send("pub-all:count-test|broadcast");
    await waitFor(() => msgsA.includes("published:3"));
    await waitFor(() => msgsB.includes("broadcast"));
    await waitFor(() => msgsC.includes("broadcast"));

    expect(msgsA).toContain("published:3");
    expect(msgsB).toContain("broadcast");
    expect(msgsC).toContain("broadcast");

    a.close();
    b.close();
    c.close();
  }, 20000);

  it("server.publish() returns 0 for unknown topics", () => {
    expect(server.publish("never-subscribed", "x")).toBe(0);
  });

  it("publish skips closed sockets and cleans on close", async () => {
    const a = await connect("clean-a");
    const b = await connect("clean-b");

    const msgsA = collectMessages(a);
    const msgsB = collectMessages(b);

    for (const [ws, msgs] of [
      [a, msgsA],
      [b, msgsB],
    ] as [WebSocket, string[]][]) {
      ws.send("sub:room-z");
      await waitFor(() => msgs.includes("subscribed"));
    }

    a.close();
    await new Promise((r) => setTimeout(r, 100));

    const count = server.publish("room-z", "after-close");
    expect(count).toBe(1);

    await waitFor(() => msgsB.includes("after-close"));
    expect(msgsB).toContain("after-close");
    b.close();
  });
});

describe("WebSocketServer — payload kinds", () => {
  it("send() accepts binary payloads", async () => {
    const ws = await connect("binary");
    const got = await new Promise((resolve, reject) => {
      ws.binaryType = "arraybuffer";
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          resolve(Array.from(new Uint8Array(event.data)));
        } else if (typeof event.data !== "string") {
          resolve(Array.from(new Uint8Array((event.data as Buffer).buffer)));
        }
      };
      ws.addEventListener("error", reject as any);
      ws.send("binary");
      setTimeout(() => reject(new Error("binary timeout")), 5000);
    });

    expect(got).toEqual([1, 2, 3, 4]);
    ws.close();
  });

  it("cork() invokes the callback synchronously with the same socket", async () => {
    const ws = await connect("corker");
    const msgs = collectMessages(ws);
    ws.send("cork");

    await waitFor(() => msgs.includes("corked"));
    await waitFor(() => msgs.includes("same") || msgs.includes("different"));
    expect(msgs).toContain("corked");
    expect(msgs).toContain("same");

    ws.close();
  }, 20000);
});
