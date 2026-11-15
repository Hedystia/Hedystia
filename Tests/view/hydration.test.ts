/** @vitest-environment happy-dom */
import {
  ErrorBoundary,
  For,
  Fragment,
  forceFlush,
  hydrate,
  Index,
  jsx,
  Match,
  onCleanup,
  onMount,
  onReady,
  Portal,
  Show,
  Suspense,
  Switch,
  set,
  sig,
  val,
} from "@hedystia/view";
import { afterEach, describe, expect, it, vi } from "vitest";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

describe("native DOM hydration", () => {
  it("passes adopted elements to refs and cancels queued refs and ready work on disposal", async () => {
    document.body.innerHTML = '<main><input value="server"></main>';
    const target = document.querySelector("main")!;
    const input = target.querySelector("input");
    const ref = vi.fn();
    const ready = vi.fn();
    const app = hydrate(() => {
      onReady(ready);
      return jsx("input", { value: "server", ref });
    }, target);
    dispose = app.dispose;
    await forceFlush();
    await Promise.resolve();
    expect(ref).toHaveBeenCalledExactlyOnceWith(input);
    expect(ready).toHaveBeenCalledOnce();
    app.dispose();
    ref.mockClear();
    ready.mockClear();
    dispose = hydrate(() => {
      onReady(ready);
      return jsx("input", { ref });
    }, target).dispose;
    dispose();
    await forceFlush();
    await Promise.resolve();
    expect(ref).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
  });

  it("preserves switch branches and contenteditable text and changes branches reactively", () => {
    document.body.innerHTML =
      '<main><strong>First</strong><div contenteditable="true">Edited</div></main>';
    const target = document.querySelector("main")!;
    const first = target.querySelector("strong");
    const editable = target.querySelector("div");
    const selected = sig(true);
    const text = sig("Initial");
    dispose = hydrate(
      () => [
        jsx(Switch, {
          children: [
            jsx(Match, {
              when: () => val(selected),
              children: jsx("strong", { children: "First" }),
            }),
            jsx(Match, { when: true, children: jsx("em", { children: "Second" }) }),
          ],
        }),
        jsx("div", { contenteditable: "true", children: () => val(text) }),
      ],
      target,
    ).dispose;
    expect(target.querySelector("strong")).toBe(first);
    expect(target.querySelector("div")).toBe(editable);
    expect(editable?.textContent).toBe("Edited");
    set(selected, false);
    expect(target.querySelector("em")?.textContent).toBe("Second");
    set(selected, true);
    expect(target.querySelector("strong")).toBe(first);
    set(text, "Updated");
    expect(editable?.textContent).toBe("Updated");
  });

  it("adopts server elements and split text, attaches events once and updates the existing nodes", () => {
    document.body.innerHTML =
      '<main><button class="counter">Count: 2!</button><p>Static</p></main>';
    const target = document.querySelector("main")!;
    const button = target.querySelector("button")!;
    const paragraph = target.querySelector("p");
    const count = sig(2);
    const cleanup = vi.fn();
    const app = hydrate(() => {
      onCleanup(cleanup);
      return [
        jsx("button", {
          class: () => (val(count) > 2 ? "changed" : "counter"),
          onClick: () => set(count, val(count) + 1),
          children: ["Count: ", () => val(count), "!"],
        }),
        jsx("p", { children: "Static" }),
      ];
    }, target);
    dispose = app.dispose;
    expect(target.querySelector("button")).toBe(button);
    expect(target.querySelector("p")).toBe(paragraph);
    expect(button.textContent).toBe("Count: 2!");
    button.click();
    expect(button.textContent).toBe("Count: 3!");
    expect(button.className).toBe("changed");
    app.dispose();
    button.click();
    expect(val(count)).toBe(3);
    app.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("preserves edits, focus and selection in native form controls until a reactive update", () => {
    document.body.innerHTML =
      '<main><input value="server"><input type="checkbox" checked><textarea>server</textarea><select><option value="a">A</option><option value="b">B</option></select></main>';
    const target = document.querySelector("main")!;
    const input = target.querySelector("input")!;
    const check = target.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const textarea = target.querySelector("textarea")!;
    const select = target.querySelector("select")!;
    input.value = "edited";
    input.focus();
    input.setSelectionRange(1, 4);
    check.checked = false;
    check.indeterminate = true;
    textarea.value = "draft";
    select.value = "b";
    const text = sig("server");
    const checked = sig(true);
    dispose = hydrate(
      () => [
        jsx("input", {
          value: () => val(text),
          onInput: (event: Event) => set(text, (event.target as HTMLInputElement).value),
        }),
        jsx("input", { type: "checkbox", checked: () => val(checked) }),
        jsx("textarea", { value: () => val(text) }),
        jsx("select", {
          children: [
            jsx("option", { value: "a", children: "A" }),
            jsx("option", { value: "b", children: "B" }),
          ],
        }),
      ],
      target,
    ).dispose;
    expect(target.querySelector("input")).toBe(input);
    expect(input.value).toBe("edited");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
    expect(check.checked).toBe(false);
    expect(check.indeterminate).toBe(true);
    expect(textarea.value).toBe("draft");
    expect(select.value).toBe("b");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(val(text)).toBe("edited");
    set(text, "next");
    expect(input.value).toBe("next");
    expect(textarea.value).toBe("next");
    set(checked, false);
    set(checked, true);
    expect(check.checked).toBe(true);
  });

  it("retargets style, attributes, HTML bindings and SVG to the server elements", () => {
    document.body.innerHTML =
      '<main><div title="one" style="color:red">one</div><svg><circle cx="1"></circle></svg></main>';
    const target = document.querySelector("main")!;
    const element = target.querySelector("div")!;
    const circle = target.querySelector("circle")!;
    const value = sig(1);
    dispose = hydrate(
      () => [
        jsx("div", {
          title: () => String(val(value)),
          style: () => ({ color: val(value) === 1 ? "red" : "blue" }),
          innerHTML: () => `<b>${val(value)}</b>`,
        }),
        jsx("svg", { children: jsx("circle", { cx: () => val(value) }) }),
      ],
      target,
    ).dispose;
    expect(target.querySelector("div")).toBe(element);
    expect(target.querySelector("circle")).toBe(circle);
    set(value, 2);
    expect(element.title).toBe("2");
    expect(element.style.color).toBe("blue");
    expect(element.innerHTML).toBe("<b>2</b>");
    expect(circle.getAttribute("cx")).toBe("2");
  });

  it("adopts conditional and list contents and updates their native insertion markers", () => {
    document.body.innerHTML = "<main><h1>Shown</h1><i>a</i><i>b</i><b>x</b></main>";
    const target = document.querySelector("main")!;
    const heading = target.querySelector("h1");
    const items = [...target.querySelectorAll("i")];
    const visible = sig(true);
    const list = sig(["a", "b"]);
    const indexed = sig(["x"]);
    dispose = hydrate(
      () => [
        jsx(Show, {
          when: () => val(visible),
          fallback: () => jsx("p", { children: "Hidden" }),
          children: jsx("h1", { children: "Shown" }),
        }),
        jsx(For<string>, {
          each: () => val(list),
          children: (value: string) => jsx("i", { children: value }),
        }),
        jsx(Index<string>, {
          each: () => val(indexed),
          children: (value: string) => jsx("b", { children: value }),
        }),
      ],
      target,
    ).dispose;
    expect(target.querySelector("h1")).toBe(heading);
    expect([...target.querySelectorAll("i")]).toEqual(items);
    set(visible, false);
    expect(target.querySelector("h1")).toBeNull();
    expect(target.querySelector("p")?.textContent).toBe("Hidden");
    set(visible, true);
    expect(target.querySelector("h1")).toBe(heading);
    set(list, ["c"]);
    set(indexed, ["y", "z"]);
    expect([...target.querySelectorAll("i")].map((node) => node.textContent)).toEqual(["c"]);
    expect([...target.querySelectorAll("b")].map((node) => node.textContent)).toEqual(["y", "z"]);
  });

  it("preserves externally owned slots and nested islands without detaching them", () => {
    document.body.innerHTML =
      "<main><section><astro-slot><astro-island><button>Nested</button></astro-island></astro-slot></section></main>";
    const target = document.querySelector("main")!;
    const slot = target.querySelector<HTMLElement>("astro-slot")!;
    const nested = slot.querySelector("astro-island");
    const clicks = vi.fn();
    nested?.addEventListener("click", clicks);
    const observer = new MutationObserver(() => {});
    observer.observe(slot.parentNode!, { childList: true });
    dispose = hydrate(() => jsx("section", { children: slot }), target).dispose;
    expect(target.querySelector("astro-slot")).toBe(slot);
    expect(slot.querySelector("astro-island")).toBe(nested);
    expect(observer.takeRecords()).toEqual([]);
    nested?.querySelector("button")?.click();
    expect(clicks).toHaveBeenCalledOnce();
    observer.disconnect();
  });

  it("recovers local mismatches, preserves compatible siblings and runs mount hooks after adoption", () => {
    document.body.innerHTML =
      "<main><p>Wrong element</p><button>Server</button><aside>Extra</aside></main>";
    const target = document.querySelector("main")!;
    const button = target.querySelector("button");
    const mounted = vi.fn();
    dispose = hydrate(() => {
      onMount(() => {
        mounted(target.querySelector("button"));
        return undefined;
      });
      return [jsx("h1", { children: "Client" }), jsx("button", { children: "Client" })];
    }, target).dispose;
    expect(target.querySelector("h1")?.textContent).toBe("Client");
    expect(target.querySelector("button")).toBe(button);
    expect(target.querySelector("aside")).toBeNull();
    expect(mounted).toHaveBeenCalledExactlyOnceWith(button);
  });

  it("adopts root accessors, suspense and error-boundary contents synchronously", () => {
    document.body.innerHTML = "<main><span>1</span><p>Ready</p><strong>Safe</strong></main>";
    const target = document.querySelector("main")!;
    const span = target.querySelector("span");
    const paragraph = target.querySelector("p");
    const strong = target.querySelector("strong");
    const count = sig(1);
    dispose = hydrate(
      () =>
        jsx(Fragment, {
          children: () => [
            jsx("span", { children: () => val(count) }),
            jsx(Suspense, { children: () => jsx("p", { children: "Ready" }) }),
            jsx(ErrorBoundary, {
              fallback: () => "Failed",
              children: () => jsx("strong", { children: "Safe" }),
            }),
          ],
        }),
      target,
    ).dispose;
    expect(target.querySelector("span")).toBe(span);
    expect(target.querySelector("p")).toBe(paragraph);
    expect(target.querySelector("strong")).toBe(strong);
    set(count, 2);
    expect(span?.textContent).toBe("2");
  });

  it("adopts portal content before moving it to its native destination and cleans it on disposal", () => {
    document.body.innerHTML = "<main><button>Portal</button></main><aside></aside>";
    const target = document.querySelector("main")!;
    const destination = document.querySelector("aside")!;
    const button = target.querySelector("button");
    const click = vi.fn();
    const app = hydrate(
      () =>
        jsx(Portal, {
          mount: destination,
          children: jsx("button", { onClick: click, children: "Portal" }),
        }),
      target,
    );
    dispose = app.dispose;
    expect(destination.querySelector("button")).toBe(button);
    button?.click();
    expect(click).toHaveBeenCalledOnce();
    app.dispose();
    expect(destination.childNodes).toHaveLength(0);
  });

  it("preserves server output and releases partial owners when component preparation fails", () => {
    document.body.innerHTML = "<main><p>Server</p></main>";
    const target = document.querySelector("main")!;
    const paragraph = target.querySelector("p");
    const cleanup = vi.fn();
    const mounted = vi.fn();
    expect(() =>
      hydrate(() => {
        onCleanup(cleanup);
        onMount(mounted);
        throw new Error("Cannot prepare");
      }, target),
    ).toThrow("Cannot prepare");
    expect(target.querySelector("p")).toBe(paragraph);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(mounted).not.toHaveBeenCalled();
  });
});
