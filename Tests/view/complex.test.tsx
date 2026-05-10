/** @vitest-environment happy-dom */
/** @jsxImportSource @hedystia/view */
import { For, Index, Match, mount, Portal, Show, Switch, set, sig, val } from "@hedystia/view";
import { beforeEach, describe, expect, it } from "vitest";

describe("Complex View Usage", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById("root")!;
  });

  it("TodoList with For (Keyed List)", async () => {
    interface Todo {
      id: number;
      text: string;
      done: boolean;
    }

    function TodoList() {
      const todos = sig<Todo[]>([
        { id: 1, text: "Learn signals", done: false },
        { id: 2, text: "Build an app", done: false },
      ]);

      let nextId = 3;

      const addTodo = () => {
        set(todos, [...val(todos), { id: nextId++, text: `Todo ${nextId}`, done: false }]);
      };

      const removeTodo = (id: number) => {
        set(
          todos,
          val(todos).filter((t) => t.id !== id),
        );
      };

      return (
        <div>
          <button type="button" id="add-todo" onClick={addTodo}>
            Add Todo
          </button>
          <ul id="todo-list">
            <For each={() => val(todos)} key={(todo) => todo.id}>
              {(todo, index) => (
                <li>
                  <span class="todo-text">{() => `${val(index) + 1}. ${val(todo).text}`}</span>
                  <button
                    type="button"
                    class="remove-todo"
                    onClick={() => removeTodo(val(todo).id)}
                  >
                    ✕
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      );
    }

    mount(TodoList, root);

    const list = root.querySelector("#todo-list")!;
    expect(list.children.length).toBe(2);
    expect(list.children[0]?.querySelector(".todo-text")?.textContent).toBe("1. Learn signals");
    expect(list.children[1]?.querySelector(".todo-text")?.textContent).toBe("2. Build an app");

    // Add todo
    (root.querySelector("#add-todo") as HTMLElement).click();
    expect(list.children.length).toBe(3);
    expect(list.children[2]?.querySelector(".todo-text")?.textContent).toBe("3. Todo 4");

    // Remove first todo
    (list.children[0]?.querySelector(".remove-todo") as HTMLElement).click();
    expect(list.children.length).toBe(2);
    expect(list.children[0]?.querySelector(".todo-text")?.textContent).toBe("1. Build an app");
    expect(list.children[1]?.querySelector(".todo-text")?.textContent).toBe("2. Todo 4");
  });

  it("App with Show (Conditional Rendering)", async () => {
    function App() {
      const loggedIn = sig(false);

      return (
        <div>
          <button type="button" id="toggle-login" onClick={() => set(loggedIn, !val(loggedIn))}>
            {() => (val(loggedIn) ? "Log out" : "Log in")}
          </button>

          <Show
            when={() => val(loggedIn)}
            fallback={<p id="fallback">Please log in to continue.</p>}
          >
            <div id="content">
              <h2>Welcome back!</h2>
              <p>You are logged in.</p>
            </div>
          </Show>
        </div>
      );
    }

    mount(App, root);

    expect(root.querySelector("#fallback")).not.toBeNull();
    expect(root.querySelector("#content")).toBeNull();
    expect(root.querySelector("#toggle-login")?.textContent).toBe("Log in");

    // Log in
    (root.querySelector("#toggle-login") as HTMLElement).click();
    expect(root.querySelector("#fallback")).toBeNull();
    expect(root.querySelector("#content")).not.toBeNull();
    expect(root.querySelector("#toggle-login")?.textContent).toBe("Log out");

    // Log out
    (root.querySelector("#toggle-login") as HTMLElement).click();
    expect(root.querySelector("#fallback")).not.toBeNull();
    expect(root.querySelector("#content")).toBeNull();
  });

  it("StatusView with Switch/Match (Multiple Branching)", async () => {
    type Status = "loading" | "error" | "success";

    function StatusView() {
      const status = sig<Status>("loading");

      return (
        <div>
          <button type="button" id="set-error" onClick={() => set(status, "error")}>
            Error
          </button>
          <button type="button" id="set-success" onClick={() => set(status, "success")}>
            Success
          </button>

          <Switch fallback={<p id="unknown">Unknown state</p>}>
            <Match when={() => val(status) === "loading"}>
              <p id="loading">Loading data...</p>
            </Match>
            <Match when={() => val(status) === "error"}>
              <p id="error" style={{ color: "red" }}>
                Something went wrong!
              </p>
            </Match>
            <Match when={() => val(status) === "success"}>
              <p id="success" style={{ color: "green" }}>
                Data loaded successfully.
              </p>
            </Match>
          </Switch>
        </div>
      );
    }

    mount(StatusView, root);

    expect(root.querySelector("#loading")).not.toBeNull();
    expect(root.querySelector("#error")).toBeNull();
    expect(root.querySelector("#success")).toBeNull();

    // Switch to error
    (root.querySelector("#set-error") as HTMLElement).click();
    expect(root.querySelector("#loading")).toBeNull();
    expect(root.querySelector("#error")).not.toBeNull();
    expect(root.querySelector("#error")?.getAttribute("style")).toContain("color: red");

    // Switch to success
    (root.querySelector("#set-success") as HTMLElement).click();
    expect(root.querySelector("#error")).toBeNull();
    expect(root.querySelector("#success")).not.toBeNull();
  });

  it("ColorPalette with Index (Index-based List)", async () => {
    function ColorPalette() {
      const colors = sig(["#ff0000", "#00ff00", "#0000ff"]);

      const addColor = () => {
        set(colors, [...val(colors), "#ffff00"]);
      };

      return (
        <div>
          <button type="button" id="add-color" onClick={addColor}>
            Add Color
          </button>
          <div id="palette" style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <Index each={() => val(colors)}>
              {(color, index) => (
                <div
                  class="color-box"
                  style={() => ({
                    width: "48px",
                    height: "48px",
                    backgroundColor: val(color),
                    borderRadius: "4px",
                  })}
                  title={`Color ${index}`}
                />
              )}
            </Index>
          </div>
        </div>
      );
    }

    mount(ColorPalette, root);

    const palette = root.querySelector("#palette")!;
    expect(palette.children.length).toBe(3);
    // Flexible color check (hex or rgb)
    const bg0 = (palette.children[0] as HTMLElement).style.backgroundColor;
    expect(bg0 === "#ff0000" || bg0 === "rgb(255, 0, 0)").toBe(true);

    // Add color
    (root.querySelector("#add-color") as HTMLElement).click();
    expect(palette.children.length).toBe(4);
    const bg3 = (palette.children[3] as HTMLElement).style.backgroundColor;
    expect(bg3 === "#ffff00" || bg3 === "rgb(255, 255, 0)").toBe(true);
  });

  it("App with Portal (Out-of-tree Rendering)", async () => {
    function App() {
      const showModal = sig(false);

      return (
        <div>
          <button type="button" id="open-modal" onClick={() => set(showModal, true)}>
            Open Modal
          </button>

          <Show when={() => val(showModal)}>
            {() => (
              <Portal>
                <div id="modal-overlay">
                  <div id="modal-content">
                    <h2>Modal</h2>
                    <button type="button" id="close-modal" onClick={() => set(showModal, false)}>
                      Close
                    </button>
                  </div>
                </div>
              </Portal>
            )}
          </Show>
        </div>
      );
    }

    mount(App, root);

    expect(document.body.querySelector("#modal-overlay")).toBeNull();

    // Open modal
    (root.querySelector("#open-modal") as HTMLElement).click();

    const overlay = document.body.querySelector("#modal-overlay");
    expect(overlay).not.toBeNull();
    // Portal renders directly into document.body by default if no mount prop is provided
    expect(overlay?.parentElement).toBe(document.body);

    // Close modal
    (document.body.querySelector("#close-modal") as HTMLElement).click();
    expect(document.body.querySelector("#modal-overlay")).toBeNull();
  });
});
