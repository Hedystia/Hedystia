import { SSEEmitter } from "./emitter";
import { Hedystia } from "./server";

import type {
  MacroData,
  RouteSchema,
  ServerWebSocket,
  SubscriptionHandler,
  WebSocketHandler,
} from "./types";

export { h } from "@hedystia/validations";

export {
  Hedystia,
  type MacroData,
  type RouteSchema,
  type ServerWebSocket,
  SSEEmitter,
  type SubscriptionHandler,
  type WebSocketHandler,
};
export default Hedystia;

export type {
  RateLimitKey,
  RateLimitOptions,
  RateLimitStore,
  SanitizationMode,
  SanitizationOptions,
  SecurityHeadersOptions,
  SecurityHeadersPreset,
  SecurityOptions,
} from "./security";
export {
  applySecurityResponse,
  consumeRateLimit,
  getRateLimitKey,
  getRequestId,
  MemoryRateLimitStore,
  RateLimitError,
  RequestTimeoutError,
  SecurityInputError,
  sanitizeInput,
  withTimeout,
} from "./security";
export type { Infer, InferInput, InferOutput, RouteDefinition, ValidationSchema } from "./types";
export type { Assertion, TestContext } from "./types/routes";
