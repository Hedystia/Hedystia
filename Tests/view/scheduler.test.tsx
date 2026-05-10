/** @vitest-environment happy-dom */
import { forceFlush, nextFrame, tick } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("Scheduler", () => {
  describe("tick()", () => {
    it("should schedule callback for next frame", async () => {
      let called = false;
      tick(() => {
        called = true;
      });
      await forceFlush();
      expect(called).toBe(true);
    });

    it("should batch multiple callbacks", async () => {
      const results: number[] = [];
      tick(() => results.push(1));
      tick(() => results.push(2));
      tick(() => results.push(3));
      await forceFlush();
      expect(results).toEqual([1, 2, 3]);
    });
  });

  describe("nextFrame()", () => {
    it("should wait for next frame", async () => {
      let called = false;
      nextFrame().then(() => {
        called = true;
      });
      await forceFlush();
      expect(called).toBe(true);
    });
  });

  describe("forceFlush()", () => {
    it("should flush all pending callbacks", async () => {
      const results: string[] = [];
      tick(() => results.push("a"));
      tick(() => results.push("b"));
      await forceFlush();
      expect(results).toEqual(["a", "b"]);
    });

    it("should clear scheduled RAF", async () => {
      tick(() => {});
      await forceFlush();
      await forceFlush();
    });
  });
});
