import { WebSocketClient } from "@hedystia/ws/client";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("native WebSocket binary and backpressure controls", () => {
  it("forwards binaryType and bufferedAmount directly to the runtime", () => {
    class Socket {
      binaryType = "blob";
      bufferedAmount = 12;
      readyState = 1;
      send = vi.fn();
      close = vi.fn();
    }
    vi.stubGlobal("WebSocket", Socket);
    const client = new WebSocketClient("wss://example.test");
    expect(client.binaryType).toBe("blob");
    client.binaryType = "arraybuffer";
    expect(client.socket.binaryType).toBe("arraybuffer");
    expect(client.bufferedAmount).toBe(12);
    Object.assign(client.socket, { bufferedAmount: 0 });
    expect(client.bufferedAmount).toBe(0);
  });
});
