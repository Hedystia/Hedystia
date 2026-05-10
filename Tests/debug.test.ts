/** @vitest-environment node */
import { describe, expect, it } from "vitest";

describe("Debug Environment", () => {
  it("checks for WebSocket", () => {
    console.log(
      "Runtime:",
      typeof process !== "undefined" && process.versions.bun ? "Bun" : "Node",
    );
    console.log("globalThis.WebSocket:", typeof globalThis.WebSocket);
    console.log("window.WebSocket:", typeof (globalThis as any).window?.WebSocket);
    expect(globalThis.WebSocket).toBeDefined();
  });
});
