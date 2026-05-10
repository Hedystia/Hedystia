import type { ServeInfo } from "@hedystia/ws";
import { createWebSocket, resolveWebSocket, serve, WebSocketClient } from "@hedystia/ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = 38951;
let server: ServeInfo;

beforeAll(async () => {
  server = await serve(
    {
      open: (ws) => {
        ws.send("welcome");
      },
      message: (ws, msg) => {
        const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg as Uint8Array);
        ws.send(`echo:${text}`);
      },
    },
    { port: PORT, hostname: "127.0.0.1" },
  );
});

afterAll(async () => {
  await server.stop(true);
});

describe("@hedystia/ws/client — resolveWebSocket()", () => {
  it("returns a WebSocket-shaped constructor", () => {
    const Ctor = resolveWebSocket();
    expect(typeof Ctor).toBe("function");
  });

  it("returns globalThis.WebSocket when available", () => {
    const Ctor = resolveWebSocket();
    expect(Ctor).toBe((globalThis as any).WebSocket);
  });
});

describe("@hedystia/ws/client — createWebSocket()", () => {
  it("connects and exchanges a welcome + echo round-trip", async () => {
    const ws = createWebSocket(`ws://127.0.0.1:${server.port}`);
    const messages: string[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => ws.send("hi");
      ws.onmessage = (event) => {
        const data = typeof event.data === "string" ? event.data : event.data.toString();
        messages.push(data);
        if (messages.length >= 2) {
          ws.close();
          resolve();
        }
      };
      ws.onerror = (err) => reject(err);
      setTimeout(() => reject(new Error("client roundtrip timeout")), 1000);
    });

    expect(messages[0]).toBe("welcome");
    expect(messages[1]).toBe("echo:hi");
  });

  it("ignores subprotocols when none provided", async () => {
    const ws = createWebSocket(`ws://127.0.0.1:${server.port}`);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        expect(ws.readyState).toBe(1);
        ws.close();
        resolve();
      };
      ws.onerror = reject;
    });
  });
});

describe("@hedystia/ws/client — WebSocketClient", () => {
  it("exposes a writable event-handler surface", async () => {
    const client = new WebSocketClient(`ws://127.0.0.1:${server.port}`);
    const messages: string[] = [];

    await new Promise<void>((resolve, reject) => {
      client.onopen = () => client.send("ping");
      client.onmessage = (event) => {
        const data = typeof event.data === "string" ? event.data : (event.data as any).toString();
        messages.push(data);
        if (messages.length >= 2) {
          client.close();
          resolve();
        }
      };
      client.onerror = reject;
      setTimeout(() => reject(new Error("client class timeout")), 1000);
    });

    expect(messages).toEqual(["welcome", "echo:ping"]);
  });

  it("readyState reflects underlying socket state", async () => {
    const client = new WebSocketClient(`ws://127.0.0.1:${server.port}`);
    expect(client.readyState).toBe(0);
    await new Promise<void>((resolve, reject) => {
      client.onopen = () => {
        expect(client.readyState).toBe(1);
        client.close();
        resolve();
      };
      client.onerror = reject;
    });
  });
});
