/** @vitest-environment happy-dom */
import { batch, effect, set, sig, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("effect()", () => {
  it("should run eagerly and track dependencies", () => {
    const count = sig(0);
    let runs = 0;
    let lastValue = -1;

    effect(() => {
      runs++;
      lastValue = val(count);
    });

    expect(runs).toBe(1);
    expect(lastValue).toBe(0);

    set(count, 1);
    expect(runs).toBe(2);
    expect(lastValue).toBe(1);

    set(count, 1); // No change
    expect(runs).toBe(2);
  });

  it("should support destructured signal accessors", () => {
    const [count, setCount] = sig(10);
    let runs = 0;
    let lastValue = -1;

    effect(() => {
      runs++;
      lastValue = count();
    });

    expect(runs).toBe(1);
    expect(lastValue).toBe(10);

    setCount(20);
    expect(runs).toBe(2);
    expect(lastValue).toBe(20);
  });

  it("should work with batch()", () => {
    const a = sig(1);
    const b = sig(2);
    let runs = 0;

    effect(() => {
      runs++;
      val(a);
      val(b);
    });

    expect(runs).toBe(1);

    batch(() => {
      set(a, 10);
      set(b, 20);
    });

    expect(runs).toBe(2);
  });

  it("should clean up nested computations", () => {
    const count = sig(0);
    const trigger = sig(0);
    let innerRuns = 0;

    effect(() => {
      val(trigger);
      effect(() => {
        val(count);
        innerRuns++;
      });
    });

    expect(innerRuns).toBe(1);

    set(count, 1);
    expect(innerRuns).toBe(2);

    set(trigger, 1); // Should dispose previous inner effect and create new one
    expect(innerRuns).toBe(3);

    set(count, 2);
    expect(innerRuns).toBe(4); // Only the latest inner effect should run
  });
});
