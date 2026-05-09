/**
 * `@hedystia/ws` — universal WebSocket primitives for Bun, Node.js
 * and Deno.
 *
 * @remarks
 * The package intentionally ships **no HTTP server**. It exposes:
 *
 * - A runtime-aware client constructor — {@link createWebSocket} and
 *   {@link WebSocketClient}.
 * - A portable {@link WebSocketServer} that consumes raw HTTP upgrade
 *   tuples and provides topic-based pub/sub matching Bun's
 *   `ServerWebSocket` API.
 * - Shared types ({@link ServerWebSocket}, {@link WebSocketHandlers}, …)
 *   and runtime detection helpers ({@link detectRuntime}, {@link isBun},
 *   {@link isNode}, {@link isDeno}, {@link isBrowser}).
 *
 * @packageDocumentation
 */

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
