/** @vitest-environment happy-dom */
import { batch, memo, peek, set, sig, untrack, update, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("Signals", () => {
  describe("sig()", () => {
    it("should create a signal with initial value", () => {
      const count = sig(0);
      expect(val(count)).toBe(0);
    });

    it("should create a signal with string value", () => {
      const name = sig("hello");
      expect(val(name)).toBe("hello");
    });

    it("should create a signal with object value", () => {
      const obj = sig({ foo: "bar" });
      expect(val(obj)).toEqual({ foo: "bar" });
    });

    it("should support destructuring [value, setValue]", () => {
      const [count, setCount] = sig(0);
      expect(count()).toBe(0);
      setCount(1);
      expect(count()).toBe(1);
      setCount((prev: number) => prev + 1);
      expect(count()).toBe(2);
    });
  });

  describe("set()", () => {
    it("should update signal value", () => {
      const count = sig(0);
      set(count, 5);
      expect(val(count)).toBe(5);
    });

    it("should return the new value", () => {
      const count = sig(0);
      const result = set(count, 10);
      expect(result).toBe(10);
    });

    it("should not trigger updates for equal values", () => {
      const count = sig(0);
      let updates = 0;
      memo(() => {
        updates++;
        val(count);
      });
      set(count, 0);
      expect(updates).toBe(1);
    });
  });

  describe("update()", () => {
    it("should update using previous value", () => {
      const count = sig(5);
      update(count, (prev) => prev + 1);
      expect(val(count)).toBe(6);
    });

    it("should work with string concatenation", () => {
      const name = sig("hello");
      update(name, (prev) => `${prev} world`);
      expect(val(name)).toBe("hello world");
    });
  });

  describe("memo()", () => {
    it("should create computed signal", () => {
      const count = sig(0);
      const doubled = memo(() => val(count) * 2);
      expect(val(doubled)).toBe(0);
    });

    it("should update when dependency changes", () => {
      const count = sig(0);
      const doubled = memo(() => val(count) * 2);
      set(count, 5);
      expect(val(doubled)).toBe(10);
    });

    it("should only recalculate when read after change", () => {
      const count = sig(0);
      let calculations = 0;
      const doubled = memo(() => {
        calculations++;
        return val(count) * 2;
      });
      expect(calculations).toBe(1);
      set(count, 5);
      expect(calculations).toBe(1);
      val(doubled);
      expect(calculations).toBe(2);
    });
  });

  describe("batch()", () => {
    it("should batch multiple updates", () => {
      const count = sig(0);
      const name = sig("a");
      let updates = 0;

      const result = memo(() => {
        updates++;
        return val(count) + val(name);
      });

      batch(() => {
        set(count, 1);
        set(name, "b");
      });

      expect(updates).toBe(1);

      val(result);
      expect(updates).toBe(2);
    });
  });

  describe("peek()", () => {
    it("should read without tracking", () => {
      const count = sig(0);
      let updates = 0;
      memo(() => {
        updates++;
        peek(count);
      });
      set(count, 5);
      expect(updates).toBe(1);
    });
  });

  describe("untrack()", () => {
    it("should run without tracking dependencies", () => {
      const count = sig(0);
      const result = untrack(() => val(count));
      expect(result).toBe(0);
    });

    it("should not register dependency", () => {
      const count = sig(0);
      let updates = 0;
      memo(() => {
        updates++;
        untrack(() => val(count));
      });
      set(count, 5);
      expect(updates).toBe(1);
    });
  });
});
