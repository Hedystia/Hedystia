/** @vitest-environment happy-dom */
import { For, jsx, mount, Show, set, sig, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

function render(component: () => any): HTMLElement {
  const target = document.createElement("div");
  mount(component, target);
  return target;
}

describe("Render regressions", () => {
  it("maps htmlFor to the for attribute on labels", () => {
    const target = render(() => jsx("label", { htmlFor: "email", children: "Email" }));
    const label = target.querySelector("label") as HTMLLabelElement;

    expect(label.getAttribute("for")).toBe("email");
    expect(label.hasAttribute("htmlFor")).toBe(false);
  });

  it("drops inline style properties removed by a reactive style", () => {
    const highlighted = sig(true);
    const target = render(() =>
      jsx("div", {
        style: () => (val(highlighted) ? { color: "red", padding: "4px" } : { padding: "4px" }),
      }),
    );
    const element = target.firstElementChild as HTMLElement;

    expect(element.style.color).toBe("red");
    expect(element.style.padding).toBe("4px");

    set(highlighted, false);

    expect(element.style.color).toBe("");
    expect(element.style.padding).toBe("4px");
    expect(element.getAttribute("style")).not.toContain("color");
  });

  it("renders root flow components synchronously on mount", () => {
    const showTarget = render(() => {
      const child = document.createElement("p");
      child.id = "sync-show";
      return Show({ when: true, children: child });
    });
    expect(showTarget.querySelector("#sync-show")).not.toBeNull();

    const forTarget = render(() =>
      For({
        each: ["a", "b"],
        children: (item) => {
          const node = document.createElement("span");
          node.className = "sync-for";
          node.textContent = String(item);
          return node;
        },
      }),
    );
    expect(forTarget.querySelectorAll(".sync-for").length).toBe(2);
  });
});
