/** @vitest-environment happy-dom */
/** @jsxImportSource @hedystia/view */
import { mount, renderToString, set, sig, val } from "@hedystia/view";
import { beforeEach, describe, expect, it } from "vitest";

describe("classList & Enhanced Class Reactivity", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById("root")!;
  });

  describe("classList", () => {
    it("should apply static classes", () => {
      const App = () => <div classList={{ a: true, b: false, c: true }} id="test" />;
      mount(App, root);
      const el = root.querySelector("#test")!;
      expect(el.classList.contains("a")).toBe(true);
      expect(el.classList.contains("b")).toBe(false);
      expect(el.classList.contains("c")).toBe(true);
    });

    it("should toggle reactive classes", async () => {
      const active = sig(false);
      const App = () => <div classList={{ active }} id="test" />;
      mount(App, root);
      const el = root.querySelector("#test")!;

      expect(el.classList.contains("active")).toBe(false);

      set(active, true);
      expect(el.classList.contains("active")).toBe(true);

      set(active, false);
      expect(el.classList.contains("active")).toBe(false);
    });

    it("should handle mixed static and reactive classes", () => {
      const b = sig(true);
      const App = () => <div classList={{ a: true, b }} id="test" />;
      mount(App, root);
      const el = root.querySelector("#test")!;
      expect(el.classList.contains("a")).toBe(true);
      expect(el.classList.contains("b")).toBe(true);

      set(b, false);
      expect(el.classList.contains("a")).toBe(true);
      expect(el.classList.contains("b")).toBe(false);
    });
  });

  describe("enhanced class attribute", () => {
    it("should support arrays with mixed values", () => {
      const extra = sig("extra-class");
      const App = () => <div class={["base", extra, () => "reactive"]} id="test" />;
      mount(App, root);
      const el = root.querySelector("#test")!;

      expect(el.className).toBe("base extra-class reactive");

      set(extra, "new-class");
      expect(el.className).toBe("base new-class reactive");

      set(extra, "");
      expect(el.className).toBe("base reactive");
    });

    it("should handle null/undefined in class array", () => {
      const App = () => <div class={["a", null, undefined, "b"]} id="test" />;
      mount(App, root);
      const el = root.querySelector("#test")!;
      expect(el.className).toBe("a b");
    });

    it("should provide initial classes before reactive updates", () => {
      const loading = sig(true);
      const App = () => (
        <div class={["btn", () => (val(loading) ? "loading" : "ready")]} id="test" />
      );
      mount(App, root);
      const el = root.querySelector("#test")!;
      expect(el.className).toBe("btn loading");

      set(loading, false);
      expect(el.className).toBe("btn ready");
    });
  });

  describe("SSR support", () => {
    it("should render classList in SSR", () => {
      const App = () => <div classList={{ a: true, b: false, c: true }} />;
      const html = renderToString(App);
      expect(html).toContain('class="a c"');
    });

    it("should render array-based class in SSR", () => {
      const App = () => <div class={["base", () => "reactive"]} />;
      const html = renderToString(App);
      expect(html).toContain('class="base reactive"');
    });

    it("should merge array-based class and classList in SSR", () => {
      const App = () => (
        <div class={["base", "extra"]} classList={{ active: true, hidden: false }} />
      );
      const html = renderToString(App);
      expect(html).toContain('class="base extra active"');
    });
  });
});
