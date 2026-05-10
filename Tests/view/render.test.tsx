/** @vitest-environment happy-dom */
import { For, Index, Match, mount, Show, Switch, sig, val } from "@hedystia/view";
import type { HTMLElement } from "happy-dom";
import { describe, expect, it } from "vitest";

function findById(parent: HTMLElement, id: string): HTMLElement | null {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i] as HTMLElement;
    if (child.id === id) {
      return child;
    }
    const found = findById(child, id);
    if (found) {
      return found;
    }
  }
  return null;
}

function countByClass(parent: HTMLElement, className: string): number {
  let count = 0;
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i] as HTMLElement;
    if (child.classList.contains(className)) {
      count++;
    }
    count += countByClass(child, className);
  }
  return count;
}

describe("Render", () => {
  describe("mount()", () => {
    it("should mount component to target", () => {
      const target = document.createElement("div");
      const App = () => document.createElement("div");
      const app = mount(App, target);
      expect(target.children.length).toBe(1);
      app.dispose();
    });

    it("should return dispose function", () => {
      const target = document.createElement("div");
      const App = () => document.createElement("div");
      const app = mount(App, target);
      expect(typeof app.dispose).toBe("function");
      app.dispose();
      expect(target.innerHTML).toBe("");
    });
  });

  describe("Show", () => {
    it("should render children when condition is true", async () => {
      const target = document.createElement("div");
      const condition = sig(true);
      const child = document.createElement("p");
      child.id = "test-child";
      const App = () => {
        return Show({
          when: () => val(condition),
          children: child,
        });
      };
      const app = mount(App, target);
      await new Promise((resolve) => queueMicrotask(resolve));
      expect(findById(target as any, "test-child")).not.toBeNull();
      app.dispose();
    });

    it("should render fallback when condition is false", async () => {
      const target = document.createElement("div");
      const condition = sig(false);
      const fallback = document.createElement("span");
      fallback.id = "test-fallback";
      const App = () => {
        return Show({
          when: () => val(condition),
          fallback,
          children: document.createElement("p"),
        });
      };
      const app = mount(App, target);
      await new Promise((resolve) => queueMicrotask(resolve));
      expect(findById(target as any, "test-fallback")).not.toBeNull();
      app.dispose();
    });

    it("should render nested Show children", async () => {
      const target = document.createElement("div");
      const App = () => {
        return Show({
          when: true,
          children: Show({
            when: true,
            fallback: document.createElement("span"),
            children: (() => {
              const inner = document.createElement("div");
              inner.id = "nested-child";
              return inner;
            })(),
          }),
        });
      };
      const app = mount(App, target);
      await new Promise((resolve) => queueMicrotask(resolve));
      await new Promise((resolve) => queueMicrotask(resolve));
      expect(findById(target as any, "nested-child")).not.toBeNull();
      app.dispose();
    });

    it("should render nested Show with multiple children via wrapper", async () => {
      const target = document.createElement("div");
      const App = () => {
        const wrapper = document.createElement("div");
        wrapper.id = "wrapper";
        const child1 = document.createElement("section");
        child1.id = "multi-1";
        const child2 = document.createElement("span");
        child2.id = "multi-2";
        wrapper.appendChild(child1);
        wrapper.appendChild(child2);
        return Show({
          when: true,
          children: Show({
            when: true,
            children: wrapper,
          }),
        });
      };
      const app = mount(App, target);
      await new Promise((resolve) => queueMicrotask(resolve));
      await new Promise((resolve) => queueMicrotask(resolve));
      expect(findById(target as any, "multi-1")).not.toBeNull();
      expect(findById(target as any, "multi-2")).not.toBeNull();
      app.dispose();
    });
  });

  describe("For", () => {
    it("should render list items", async () => {
      const target = document.createElement("div");
      const items = ["a", "b", "c"];
      const App = () => {
        return For({
          each: items,
          children: (item) => {
            const div = document.createElement("div");
            div.textContent = String(item);
            div.className = "item";
            return div;
          },
        });
      };
      const app = mount(App, target);
      await new Promise((resolve) => queueMicrotask(resolve));
      expect(countByClass(target as any, "item")).toBe(3);
      app.dispose();
    });
  });

  describe("Index", () => {
    it("should render list with index", async () => {
      const target = document.createElement("div");
      const items = ["a", "b", "c"];
      const App = () => {
        return Index({
          each: items,
          children: (item) => {
            const div = document.createElement("div");
            div.textContent = String(item);
            div.className = "indexed-item";
            return div;
          },
        });
      };
      const app = mount(App, target);
      await new Promise((resolve) => queueMicrotask(resolve));
      expect(countByClass(target as any, "indexed-item")).toBe(3);
      app.dispose();
    });
  });

  describe("Switch and Match", () => {
    it("should render matching case", async () => {
      const target = document.createElement("div");
      const route = "home";
      const home = document.createElement("div");
      home.id = "home";
      const App = () => {
        return Switch({
          children: [
            Match({
              when: route === "home",
              children: home,
            }),
          ],
        });
      };
      const app = mount(App, target);
      await new Promise((resolve) => queueMicrotask(resolve));
      expect(findById(target as any, "home")).not.toBeNull();
      app.dispose();
    });

    it("should render fallback when no match", async () => {
      const target = document.createElement("div");
      const fallback = document.createElement("div");
      fallback.id = "fallback";
      const App = () => {
        return Switch({
          fallback,
          children: [
            Match({
              when: ("home" as string) === "other",
              children: document.createElement("div"),
            }),
          ],
        });
      };
      const app = mount(App, target);
      await new Promise((resolve) => queueMicrotask(resolve));
      expect(findById(target as any, "fallback")).not.toBeNull();
      app.dispose();
    });
  });
});
