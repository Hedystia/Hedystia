import { createClient } from "@hedystia/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionManager } from "../../Packages/client/src/managers/subscription";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe("client subscriptions", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reconnects without dropping subscribers or their onMessage handlers", async () => {
    const client = createClient("http://api.example.test");
    const first: number[] = [];
    const second: number[] = [];
    const firstMessages: number[] = [];
    const secondMessages: number[] = [];

    const firstSubscription = (client as any).feed.subscribe(
      (event: any) => first.push(event.data.n),
      { onMessage: (message: any) => firstMessages.push(message.data.n) },
    );
    const secondSubscription = (client as any).feed.subscribe(
      (event: any) => second.push(event.data.n),
      { onMessage: (message: any) => secondMessages.push(message.data.n) },
    );

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive({ data: { n: 1 } });
    expect(first).toEqual([1]);
    expect(second).toEqual([1]);
    expect(firstMessages).toEqual([1]);
    expect(secondMessages).toEqual([1]);

    socket.close();
    await vi.advanceTimersByTimeAsync(1100);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const reconnected = FakeWebSocket.instances[1]!;
    reconnected.open();
    reconnected.receive({ data: { n: 2 } });
    expect(first).toEqual([1, 2]);
    expect(second).toEqual([1, 2]);
    expect(firstMessages).toEqual([1, 2]);
    expect(secondMessages).toEqual([1, 2]);

    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });

  it("does not revive a subscription unsubscribed while still connecting", async () => {
    const client = createClient("http://api.example.test");
    const subscription = (client as any).feed.subscribe(() => {});

    const socket = FakeWebSocket.instances[0]!;
    subscription.unsubscribe();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);

    socket.open();
    expect(socket.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("stops reconnecting after close()", async () => {
    const manager = new SubscriptionManager("http://api.example.test");
    const subscription = manager.subscribe("/feed", () => {});

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    manager.close();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);

    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    subscription.unsubscribe();
  });
});
