import { createClient } from "@hedystia/client";
import Framework from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const app = new Framework()
  .ws("/chat", {
    message: (ws, message) => {
      const data = typeof message === "string" ? message : new TextDecoder().decode(message);
      ws.send(`You said: ${data}`);
    },
    open: (ws) => {
      ws.send("Welcome to the chat server!");
    },
  })
  .listen(3009);

describe("WebSocket Tests", () => {
  it("should connect to WebSocket endpoint", async () => {
    const ws = new WebSocket("ws://127.0.0.1:3009/chat");

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        resolve();
      };
      ws.onerror = (err) => reject(new Error(`Failed to connect: ${err}`));
      setTimeout(() => reject(new Error("Connection timeout")), 1000);
    });
  });

  it("should receive welcome message", async () => {
    const ws = new WebSocket("ws://127.0.0.1:3009/chat");

    await new Promise<void>((resolve, reject) => {
      ws.onmessage = (event) => {
        expect(event.data).toBe("Welcome to the chat server!");
        ws.close();
        resolve();
      };
      ws.onerror = (err) => reject(new Error(`Error: ${err}`));
      setTimeout(() => reject(new Error("Message timeout")), 1000);
    });
  });

  it("should echo messages", async () => {
    const ws = new WebSocket("ws://127.0.0.1:3009/chat");

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.send("Hello WebSocket!");
      };

      ws.onmessage = (event) => {
        if (event.data === "Welcome to the chat server!") {
          return;
        }
        expect(event.data).toBe("You said: Hello WebSocket!");
        ws.close();
        resolve();
      };

      setTimeout(() => reject(new Error("Echo timeout")), 1000);
    });
  });
});

describe("WebSocket Tests with Client", () => {
  const client = createClient<typeof app>("http://127.0.0.1:3009", {
    debugLevel: "debug",
  });

  it("should connect using client", async () => {
    await new Promise<void>((resolve, reject) => {
      client.chat.ws((ws) => {
        ws.onConnect(() => {
          ws.disconnect();
          resolve();
        });
        ws.onError((err) => reject(err));
      });
      setTimeout(() => reject(new Error("Connection timeout")), 1000);
    });
  });

  it("should receive messages and send messages via client", async () => {
    let welcomeReceived = false;

    await new Promise<void>((resolve, reject) => {
      client.chat.ws((ws) => {
        ws.onMessage((msg) => {
          if (msg === "Welcome to the chat server!") {
            welcomeReceived = true;
            ws.send("Hello from client!");
            return;
          }

          if (welcomeReceived) {
            expect(msg).toBe("You said: Hello from client!");
            ws.disconnect();
            resolve();
          }
        });
        ws.onError((err) => reject(err));
      });
      setTimeout(() => reject(new Error("Echo timeout")), 1000);
    });
  });
});

afterAll(() => {
  app.close();
});
