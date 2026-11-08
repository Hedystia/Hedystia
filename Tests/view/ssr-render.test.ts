/** @vitest-environment node */
import { ErrorBoundary, jsx, renderToString, Suspense } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("SSR serialization", () => {
  it("renders static form state as attributes", () => {
    expect(renderToString(jsx("input", { value: "saved" }))).toBe('<input value="saved">');
    expect(renderToString(jsx("input", { type: "checkbox", checked: true }))).toBe(
      '<input type="checkbox" checked>',
    );
  });

  it("evaluates reactive value and checked accessors", () => {
    expect(renderToString(jsx("input", { value: () => "typed" }))).toBe('<input value="typed">');
    expect(renderToString(jsx("input", { type: "checkbox", checked: () => true }))).toBe(
      '<input type="checkbox" checked>',
    );
  });

  it("renders a textarea value as text content", () => {
    expect(renderToString(jsx("textarea", { value: "hello <world>" }))).toBe(
      "<textarea>hello &lt;world&gt;</textarea>",
    );
    expect(renderToString(jsx("textarea", { value: () => "draft" }))).toBe(
      "<textarea>draft</textarea>",
    );
  });

  it("renders Suspense children inline", () => {
    expect(renderToString(jsx(Suspense, { children: "ready" }))).toBe("ready");
  });

  it("renders ErrorBoundary children and falls back on thrown errors", () => {
    expect(
      renderToString(jsx(ErrorBoundary, { fallback: () => "fallback", children: "ready" })),
    ).toBe("ready");

    expect(
      renderToString(
        jsx(ErrorBoundary, {
          fallback: (error: Error) => `caught: ${error.message}`,
          children: () => {
            throw new Error("boom");
          },
        }),
      ),
    ).toBe("caught: boom");
  });

  it("converts camelCase style properties to kebab-case", () => {
    expect(renderToString(jsx("div", { style: { backgroundColor: "red", marginTop: 4 } }))).toBe(
      '<div style="background-color:red;margin-top:4"></div>',
    );
    expect(renderToString(jsx("div", { style: () => ({ color: "blue" }) }))).toBe(
      '<div style="color:blue"></div>',
    );
  });
});
