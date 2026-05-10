/** @vitest-environment happy-dom */
import { memo, on, set, sig, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("effect() through memo chain", () => {
  it("multiple on() effects observing same memo all re-run", () => {
    const width = sig(1200);
    const layout = memo(() => {
      const w = val(width);
      return { cols: w > 600 ? 4 : 1, w };
    });

    let styleRuns = 0;
    let childRuns = 0;
    let lastChildLayout: any;

    on(
      () => val(layout),
      () => {
        styleRuns++;
      },
    );

    on(
      () => val(layout),
      (l) => {
        childRuns++;
        lastChildLayout = l;
      },
    );

    expect(styleRuns).toBe(1);
    expect(childRuns).toBe(1);

    set(width, 400);
    expect(styleRuns).toBe(2);
    expect(childRuns).toBe(2);
    expect(lastChildLayout.cols).toBe(1);

    set(width, 800);
    expect(styleRuns).toBe(3);
    expect(childRuns).toBe(3);
    expect(lastChildLayout.cols).toBe(4);
  });
});
