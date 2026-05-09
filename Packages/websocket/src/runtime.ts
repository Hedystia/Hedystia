/**
 * Tiny runtime detection helpers used to pick the right WebSocket
 * implementation at module load time.
 *
 * @packageDocumentation
 */

/**
 * String identifier of the JavaScript runtime hosting the current process.
 */
export type Runtime = "bun" | "node" | "deno" | "browser" | "unknown";

/**
 * Detect the host runtime by probing well-known globals.
 *
 * @returns A {@link Runtime} discriminator for the active environment.
 *
 * @example
 * ```ts
 * import { detectRuntime } from "@hedystia/websocket";
 *
 * if (detectRuntime() === "bun") {
 *   // ...use Bun-specific APIs
 * }
 * ```
 */
export function detectRuntime(): Runtime {
  if (typeof globalThis === "undefined") {
    return "unknown";
  }
  const g = globalThis as any;
  if (g.Bun?.serve) {
    return "bun";
  }
  if (g.Deno) {
    return "deno";
  }
  if (g.process?.versions?.node) {
    return "node";
  }
  if (typeof g.window !== "undefined" && typeof g.document !== "undefined") {
    return "browser";
  }
  return "unknown";
}

/**
 * Convenience predicate.
 *
 * @returns `true` when running on Bun.
 */
export const isBun = (): boolean => detectRuntime() === "bun";

/**
 * Convenience predicate.
 *
 * @returns `true` when running on Node.js.
 */
export const isNode = (): boolean => detectRuntime() === "node";

/**
 * Convenience predicate.
 *
 * @returns `true` when running on Deno.
 */
export const isDeno = (): boolean => detectRuntime() === "deno";

/**
 * Convenience predicate.
 *
 * @returns `true` when running inside a browser-like environment.
 */
export const isBrowser = (): boolean => detectRuntime() === "browser";
