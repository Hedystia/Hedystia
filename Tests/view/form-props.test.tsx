/** @vitest-environment happy-dom */
import { jsx, mount, set, sig, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

function render(tag: string, props: Record<string, any>): HTMLElement {
  const target = document.createElement("div");
  mount(() => jsx(tag, props) as any, target);
  return target;
}

describe("Form props", () => {
  it("keeps a reactive input value in sync after the user edits the box", () => {
    const value = sig("initial");
    const target = render("input", { value: () => val(value) });
    const input = target.querySelector("input") as HTMLInputElement;

    expect(input.value).toBe("initial");

    // Editing marks the input as dirty, so the value attribute no longer
    // drives what the box displays.
    input.value = "typed by the user";
    set(value, "from the signal");

    expect(input.value).toBe("from the signal");
    expect(input.getAttribute("value")).toBe("from the signal");
  });

  it("applies a reactive value to a textarea, which ignores the value attribute", () => {
    const value = sig("draft");
    const target = render("textarea", { value: () => val(value) });
    const textarea = target.querySelector("textarea") as HTMLTextAreaElement;

    expect(textarea.value).toBe("draft");

    set(value, "saved text");

    expect(textarea.value).toBe("saved text");
  });

  it("keeps a reactive checkbox checked state in sync after the user toggles it", () => {
    const checked = sig(false);
    const target = render("input", { type: "checkbox", checked: () => val(checked) });
    const input = target.querySelector("input") as HTMLInputElement;

    expect(input.checked).toBe(false);

    // Toggling by the user marks the checkbox as dirty.
    input.click();
    expect(input.checked).toBe(true);

    // Sync the signal with the DOM first, then reset it: the attribute alone
    // stops driving the box once the user has toggled it.
    set(checked, true);
    set(checked, false);

    expect(input.checked).toBe(false);
    expect(input.hasAttribute("checked")).toBe(false);
  });

  it("mirrors a static checked prop to both the property and the attribute", () => {
    const target = render("input", { type: "checkbox", checked: true });
    const input = target.querySelector("input") as HTMLInputElement;

    expect(input.checked).toBe(true);
    expect(input.hasAttribute("checked")).toBe(true);
  });

  it("runs a reactive value accessor once per change without redundant work", () => {
    const value = sig("a");
    let runs = 0;
    const target = render("input", {
      value: () => {
        runs++;
        return val(value);
      },
    });
    const input = target.querySelector("input") as HTMLInputElement;

    expect(runs).toBe(1);
    expect(input.value).toBe("a");

    set(value, "b");
    expect(runs).toBe(2);
    expect(input.value).toBe("b");

    // Setting the same value must not re-run the accessor.
    set(value, "b");
    expect(runs).toBe(2);
  });

  it("does not loop when onInput writes the typed text back to the signal", () => {
    const value = sig("");
    const target = render("input", {
      value: () => val(value),
      onInput: (event: Event) => {
        set(value, (event.currentTarget as HTMLInputElement).value);
      },
    });
    const input = target.querySelector("input") as HTMLInputElement;

    input.value = "hello";
    input.dispatchEvent(new Event("input"));

    expect(value()).toBe("hello");
    expect(input.value).toBe("hello");
  });
});
