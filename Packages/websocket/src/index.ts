export type { ClientWebSocketOptions } from "./client";
export { createWebSocket, resolveWebSocket, WebSocketClient } from "./client";
export type { Runtime } from "./runtime";
export { detectRuntime, isBrowser, isBun, isDeno, isNode } from "./runtime";
export type {
  ServeInfo,
  ServerWebSocket,
  UpgradeOptions,
  UpgradeRequest,
  WebSocketHandlers,
  WebSocketServerOptions,
  WSData,
  WSMessage,
} from "./server";

import { serve, WebSocketServer } from "./server";

export { serve, WebSocketServer };

export default WebSocketServer;
