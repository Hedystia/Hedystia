/** @vitest-environment happy-dom */
import { jsxDEV } from "@hedystia/view/jsx-dev-runtime";
import { afterEach, describe, expect, it } from "vitest";

const boom = () => {
  throw new Error("boom");
};

describe("jsxDEV", () => {
  afterEach(() => {
    delete (window as any).__DEV__;
  });

  it("decorates development errors with the source location", () => {
    (window as any).__DEV__ = true;

    expect(() => jsxDEV(boom, {}, undefined, false, "App.tsx", 12, 4)).toThrow(
      "jsxDEV error for boom at App.tsx:12:4: boom",
    );
  });

  it("leaves production errors untouched", () => {
    expect(() => jsxDEV(boom, {})).toThrow(/^boom$/);
  });
});
