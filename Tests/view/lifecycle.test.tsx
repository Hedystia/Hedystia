/** @vitest-environment happy-dom */
import { createRoot, onCleanup, sig, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("Lifecycle", () => {
  describe("onCleanup()", () => {
    it("should register cleanup callback", () => {
      let cleanupCalled = false;

      createRoot(() => {
        onCleanup(() => {
          cleanupCalled = true;
        });
      });

      expect(cleanupCalled).toBe(false);
    });

    it("should run cleanup on dispose", () => {
      let cleanupCalled = false;

      const dispose = createRoot((dispose) => {
        onCleanup(() => {
          cleanupCalled = true;
        });
        return dispose;
      });

      dispose();
      expect(cleanupCalled).toBe(true);
    });

    it("should run multiple cleanups in reverse order", () => {
      const order: number[] = [];

      createRoot((dispose) => {
        onCleanup(() => order.push(1));
        onCleanup(() => order.push(2));
        onCleanup(() => order.push(3));
        dispose();
      });

      expect(order).toEqual([3, 2, 1]);
    });
  });

  describe("createRoot()", () => {
    it("should create reactive root", () => {
      const count = sig(0);
      let rootValue: number | undefined;

      createRoot(() => {
        rootValue = val(count);
      });

      expect(rootValue).toBe(0);
    });

    it("should provide dispose function", () => {
      const dispose = createRoot((d) => d);
      expect(typeof dispose).toBe("function");
    });

    it("should clean up owned computations", () => {
      let cleanupCalled = false;

      const dispose = createRoot((d) => {
        onCleanup(() => {
          cleanupCalled = true;
        });
        return d;
      });

      dispose();
      expect(cleanupCalled).toBe(true);
    });
  });
});
