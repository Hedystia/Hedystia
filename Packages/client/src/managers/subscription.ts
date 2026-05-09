import { createWebSocket } from "@hedystia/ws/client";
import type { Subscription, SubscriptionCallback, SubscriptionOptions } from "../types";
import { calculateReconnectDelay, createLogger, generateUUID, replaceTimeout } from "../utils";

type DebugLevel = "none" | "debug" | "warn" | "log" | "error";

type HandlerEntry = {
  id: string;
  callback: SubscriptionCallback;
  unsubscribe: () => void;
  send: (data: any) => void;
};

type ConnectionState = {
  abortController?: AbortController;
  socket?: WebSocket;
  handlers: Array<HandlerEntry>;
  serverSubscriptionId?: string;
  manuallyClosed?: boolean;
  reconnectAttempts?: number;
  reconnectTimeout?: ReturnType<typeof setTimeout>;
  heartbeatInterval?: ReturnType<typeof setInterval>;
  clientSubscriptionId: string;
};

/**
 * SubscriptionManager handles both Server-Sent Events (SSE) and WebSocket connections
 * for real-time data subscriptions
 */
export class SubscriptionManager {
  private static readonly pathSubscriptionIds = new Map<string, string>();

  private connections = new Map<string, ConnectionState>();
  private baseUrl: string;
  private credentials?: "omit" | "same-origin" | "include";
  private sse: boolean;
  private readonly MIN_RECONNECT_DELAY = 100;
  private readonly HEARTBEAT_INTERVAL = 25000;
  private log: ReturnType<typeof createLogger>;
  private headers?: Record<string, string>;

  constructor(
    baseUrl: string,
    credentials?: "omit" | "same-origin" | "include",
    sse = false,
    debugLevel: DebugLevel = "none",
    headers?: Record<string, string>,
  ) {
    this.baseUrl = baseUrl;
    this.credentials = credentials;
    this.sse = sse;
    this.log = createLogger(debugLevel);
    this.headers = headers;
  }

  private static getOrCreatePathSubscriptionId(path: string): string {
    if (!SubscriptionManager.pathSubscriptionIds.has(path)) {
      SubscriptionManager.pathSubscriptionIds.set(path, generateUUID());
    }
    return SubscriptionManager.pathSubscriptionIds.get(path)!;
  }

  private dispatchMessage(path: string, message: any, options?: SubscriptionOptions) {
    const { data, error } = message;
    const conn = this.connections.get(path);
    if (conn) {
      if (message.subscriptionId && !conn.serverSubscriptionId) {
        this.log("debug", "Received subscription ID from server", {
          path,
          subscriptionId: message.subscriptionId,
        });
        conn.serverSubscriptionId = message.subscriptionId;
      }
      for (const h of conn.handlers) {
        if (options?.onMessage) {
          options.onMessage(message);
        }
        h.callback({ data, error, unsubscribe: h.unsubscribe, send: h.send });
      }
    }
  }

  private handleActivityCheck(path: string, checkId: string, sendResponse: (payload: any) => void) {
    const conn = this.connections.get(path);
    const subscriptionId = conn?.serverSubscriptionId || conn?.clientSubscriptionId;
    this.log("debug", "Activity check received, sending response", {
      path,
      subscriptionId,
      checkId,
    });
    sendResponse({
      type: "activity_check_response",
      checkId,
      path,
      subscriptionId,
    });
  }

  private cleanupConnection(conn: ConnectionState) {
    if (conn.heartbeatInterval) {
      clearInterval(conn.heartbeatInterval);
    }
    if (conn.reconnectTimeout) {
      clearTimeout(conn.reconnectTimeout);
    }
  }

  private scheduleReconnect(conn: ConnectionState, fn: () => void): ReturnType<typeof setTimeout> {
    conn.reconnectAttempts = (conn.reconnectAttempts || 0) + 1;
    const delay = calculateReconnectDelay(conn.reconnectAttempts, {
      minDelay: this.MIN_RECONNECT_DELAY,
    });
    return replaceTimeout(conn.reconnectTimeout, fn, delay);
  }

  public subscribe(
    path: string,
    callback: SubscriptionCallback,
    options?: SubscriptionOptions,
  ): Subscription {
    const transport = options?.sse || this.sse;

    if (transport) {
      return this.subscribeWithSSE(path, callback, options);
    }
    return this.subscribeWithWebSocket(path, callback, options);
  }

  private subscribeWithWebSocket(
    path: string,
    callback: SubscriptionCallback,
    options?: SubscriptionOptions,
  ): Subscription {
    const id = generateUUID();
    const wsUrl = this.baseUrl.replace(/^http/, "ws") + path;
    const clientSubscriptionId = SubscriptionManager.getOrCreatePathSubscriptionId(path);

    let connection = this.connections.get(path);
    if (!connection) {
      const socket = createWebSocket(wsUrl, this.headers ? { headers: this.headers } : undefined);
      connection = { socket, handlers: [], reconnectAttempts: 0, clientSubscriptionId };
      this.connections.set(path, connection);

      const connRef = connection;

      socket.onopen = () => {
        this.log("debug", "WebSocket connected", {
          path,
          subscriptionId: connRef.clientSubscriptionId,
        });
        connRef.reconnectAttempts = 0;
        if (connRef.heartbeatInterval) {
          clearInterval(connRef.heartbeatInterval);
        }
        connRef.heartbeatInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: "ping" }));
            } catch {
              clearInterval(connRef.heartbeatInterval);
            }
          } else {
            clearInterval(connRef.heartbeatInterval);
          }
        }, this.HEARTBEAT_INTERVAL);

        const subscriptionId = connRef.serverSubscriptionId || connRef.clientSubscriptionId;
        const payload = {
          type: "subscribe",
          path,
          headers: { ...this.headers, ...options?.headers },
          query: options?.query,
          subscriptionId,
        };
        this.log("debug", "Subscribing", { path, subscriptionId });
        socket.send(JSON.stringify(payload));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "activity_check" && message.checkId) {
            this.handleActivityCheck(path, message.checkId, (payload) => {
              socket.send(JSON.stringify(payload));
            });
            return;
          }

          this.dispatchMessage(path, message, options);
        } catch (e) {
          this.log("error", "Error parsing WS message", e);
        }
      };

      socket.onclose = () => {
        this.log("warn", "WebSocket closed", { path, attempts: connRef.reconnectAttempts });
        this.cleanupConnection(connRef);
        if (connRef && !connRef.manuallyClosed) {
          this.log("debug", "WebSocket reconnecting", {
            path,
            attempt: (connRef.reconnectAttempts || 0) + 1,
          });
          connRef.reconnectTimeout = this.scheduleReconnect(connRef, () => {
            this.connections.delete(path);
            this.subscribeWithWebSocket(path, callback, options);
          });
        }
      };

      socket.onerror = (error) => {
        this.log("error", "WebSocket error", { path, error });
      };
    }

    const send = (data: any) => {
      const conn = this.connections.get(path);
      const targetId = conn?.serverSubscriptionId || id;

      if (conn?.socket && conn.socket.readyState === WebSocket.OPEN) {
        this.log("debug", "Sending message on subscription", { path, subscriptionId: targetId });
        const payload = {
          type: "message",
          path,
          data,
          subscriptionId: targetId,
        };
        conn.socket.send(JSON.stringify(payload));
      }
    };

    const unsubscribe = () => {
      this.log("debug", "Unsubscribing", { path });
      const conn = this.connections.get(path);
      if (!conn) {
        return;
      }

      conn.handlers = conn.handlers.filter((h) => h.id !== id);
      if (conn.handlers.length === 0) {
        this.cleanupConnection(conn);
        if (conn.socket && conn.socket.readyState === WebSocket.OPEN) {
          const subscriptionId = conn.serverSubscriptionId || conn.clientSubscriptionId;
          this.log("debug", "Sending unsubscribe message", { path, subscriptionId });
          const payload = {
            type: "unsubscribe",
            path,
            subscriptionId,
          };
          conn.socket.send(JSON.stringify(payload));
          conn.manuallyClosed = true;
          conn.socket.close();
        }
        this.connections.delete(path);
      }
    };

    connection.handlers.push({ id, callback, unsubscribe, send });

    return { unsubscribe, send };
  }

  private subscribeWithSSE(
    path: string,
    callback: SubscriptionCallback,
    options?: SubscriptionOptions,
  ): Subscription {
    const id = generateUUID();

    const send = (data: any) => {
      const conn = this.connections.get(path);

      const payload = data || {};

      let url = `${this.baseUrl}${path}`;
      if (options?.query) {
        url += `?${new URLSearchParams(options.query as Record<string, string>).toString()}`;
      }

      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hedystia-subscription-id": conn?.serverSubscriptionId || "",
          ...this.headers,
          ...options?.headers,
        },
        body: JSON.stringify(payload),
        credentials: this.credentials,
      }).catch((e) => this.log("error", "SSE Failed to send message", e));
    };

    let url = `${this.baseUrl}${path}`;
    if (options?.query) {
      url += `?${new URLSearchParams(options.query as Record<string, string>).toString()}`;
    }

    let connection = this.connections.get(path);
    if (!connection) {
      const abortController = new AbortController();
      const clientSubscriptionId = SubscriptionManager.getOrCreatePathSubscriptionId(path);
      connection = { abortController, handlers: [], reconnectAttempts: 0, clientSubscriptionId };
      this.connections.set(path, connection);

      const connRef = connection;
      const attemptConnect = () => {
        if (connRef.manuallyClosed) {
          return;
        }

        (async () => {
          try {
            const response = await fetch(url, {
              headers: {
                Accept: "text/event-stream",
                ...this.headers,
                ...options?.headers,
              },
              credentials: this.credentials,
              signal: abortController.signal,
            });

            if (!response.ok || !response.body) {
              this.log("warn", "SSE connection failed, reconnecting", {
                path,
                status: response.status,
              });
              connRef.reconnectTimeout = this.scheduleReconnect(connRef, attemptConnect);
              return;
            }

            this.log("debug", "SSE connected", {
              path,
              subscriptionId: connRef.clientSubscriptionId,
            });
            connRef.reconnectAttempts = 0;
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const jsonData = line.slice(6);
                    const message = JSON.parse(jsonData);

                    if (message.type === "activity_check" && message.checkId) {
                      const conn = this.connections.get(path);
                      if (conn?.serverSubscriptionId) {
                        let sendUrl = `${this.baseUrl}${path}`;
                        if (options?.query) {
                          sendUrl += `?${new URLSearchParams(options.query as Record<string, string>).toString()}`;
                        }
                        this.handleActivityCheck(path, message.checkId, (payload) => {
                          fetch(sendUrl, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "x-hedystia-subscription-id": conn.serverSubscriptionId!,
                              ...this.headers,
                              ...options?.headers,
                            },
                            body: JSON.stringify(payload),
                            credentials: this.credentials,
                          }).catch((e) =>
                            this.log("error", "SSE Failed to send activity check response", e),
                          );
                        });
                      }
                      return;
                    }

                    this.dispatchMessage(path, message, options);
                  } catch (e) {
                    this.log("error", "SSE Error processing message", e);
                  }
                }
              }
            }

            if (!connRef.manuallyClosed) {
              connRef.reconnectAttempts = 0;
              const delay = this.MIN_RECONNECT_DELAY;
              this.log("debug", "SSE stream ended, reconnecting", { path, delay });
              connRef.reconnectTimeout = replaceTimeout(
                connRef.reconnectTimeout,
                attemptConnect,
                delay,
              );
            }
          } catch (e: any) {
            if (e.name !== "AbortError" && !connRef.manuallyClosed) {
              this.log("error", "SSE error", {
                path,
                error: e.message,
              });
              connRef.reconnectTimeout = this.scheduleReconnect(connRef, attemptConnect);
            }
          }
        })();
      };

      attemptConnect();
    }

    const unsubscribe = () => {
      const conn = this.connections.get(path);
      if (!conn) {
        return;
      }

      conn.handlers = conn.handlers.filter((h) => h.id !== id);

      if (conn.handlers.length === 0) {
        this.cleanupConnection(conn);
        if (conn.abortController) {
          conn.manuallyClosed = true;
          conn.abortController.abort();
        }
        this.connections.delete(path);
      }
    };

    connection.handlers.push({ id, callback, unsubscribe, send });

    return { unsubscribe, send };
  }

  public close() {
    for (const [, conn] of this.connections) {
      this.cleanupConnection(conn);
      if (conn.abortController) {
        conn.abortController.abort();
      }
      if (conn.socket) {
        conn.socket.close();
      }
    }
    this.connections.clear();
  }
}
