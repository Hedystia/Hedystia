export type { ClientWebSocketOptions } from "./client";
export { createWebSocket, resolveWebSocket, WebSocketClient } from "./client";
export type { Runtime } from "./runtime";
export { detectRuntime, isBrowser, isBun, isDeno, isNode } from "./runtime";
export type {
  ServerWebSocket,
  UpgradeOptions,
  UpgradeRequest,
  WebSocketHandlers,
  WebSocketServerOptions,
  WSData,
  WSMessage,
} from "./server";

import { WebSocketServer } from "./server";

export { WebSocketServer };

export default WebSocketServer;
