/** @vitest-environment happy-dom */
/** @jsxImportSource @hedystia/view */
import {
  ctx,
  For,
  forceFlush,
  Match,
  mount,
  Portal,
  Show,
  Switch,
  set,
  sig,
  use,
  val,
} from "@hedystia/view";
import { beforeEach, describe, expect, it } from "vitest";

describe("Dashboard Complexity Test", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById("root")!;
  });

  it("renders a multi-layered hierarchical dashboard with reactive context", async () => {
    // 1. Context for User & Permissions
    interface User {
      name: string;
      role: "admin" | "user" | "guest";
    }
    const UserCtx = ctx<User>({ name: "Anonymous", role: "guest" });

    // 2. State for Navigation and User
    const currentTab = sig<"home" | "admin" | "profile">("home");
    const userState = sig<User>({ name: "Zastinian", role: "admin" });

    // 3. Components
    function Home() {
      const widgets = sig([
        { id: 1, title: "Weather", expanded: sig(false) },
        { id: 2, title: "Stock", expanded: sig(false) },
      ]);

      return (
        <div id="home-view">
          <h3>Widgets</h3>
          <div class="widgets-grid">
            <For each={() => val(widgets)} key={(w) => w.id}>
              {(widget) => (
                <div class="widget-card">
                  <h4>{widget.title}</h4>
                  <button
                    type="button"
                    class="toggle-widget"
                    onClick={() => set(widget.expanded, !val(widget.expanded))}
                  >
                    {() => (val(widget.expanded) ? "Collapse" : "Expand")}
                  </button>
                  <Show when={() => val(widget.expanded)}>
                    <p class="details">Detailed information for {widget.title}</p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      );
    }

    function Admin() {
      // Consume context
      const _user = use(UserCtx);

      const groups = sig([
        { name: "IT", users: sig(["Alice", "Bob"]) },
        { name: "HR", users: sig(["Charlie"]) },
      ]);

      return (
        <div id="admin-view">
          <h3>Admin Panel (User: {() => use(UserCtx).name})</h3>
          <Switch fallback={<p id="denied">Access Denied</p>}>
            <Match when={() => use(UserCtx).role === "admin"}>
              <div class="groups-list">
                <For each={() => val(groups)} key={(g) => g.name}>
                  {(group) => (
                    <div class="group-item">
                      <h5>Group: {group.name}</h5>
                      <ul>
                        <For each={() => val(group.users)} key={(u) => u}>
                          {(u) => <li>{u}</li>}
                        </For>
                      </ul>
                    </div>
                  )}
                </For>
              </div>
            </Match>
            <Match when={() => use(UserCtx).role === "user"}>
              <p id="restricted">Restricted Access</p>
            </Match>
          </Switch>
        </div>
      );
    }

    function Profile() {
      const _user = use(UserCtx);
      const showModal = sig(false);

      return (
        <div id="profile-view">
          <h3>Profile of {() => use(UserCtx).name}</h3>
          <button type="button" id="open-settings" onClick={() => set(showModal, true)}>
            Settings
          </button>
          <Show when={() => val(showModal)}>
            {() => (
              <Portal>
                <div id="settings-portal">
                  <div class="modal">
                    <h2>Settings for {() => use(UserCtx).name}</h2>
                    <button type="button" id="close-settings" onClick={() => set(showModal, false)}>
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

    function App() {
      // Pass an accessor to Provider to make it reactive
      return (
        <UserCtx.Provider value={() => val(userState)}>
          {() => (
            <>
              <nav>
                <button type="button" id="btn-home" onClick={() => set(currentTab, "home")}>
                  Home
                </button>
                <button type="button" id="btn-admin" onClick={() => set(currentTab, "admin")}>
                  Admin
                </button>
                <button type="button" id="btn-profile" onClick={() => set(currentTab, "profile")}>
                  Profile
                </button>
                <button
                  type="button"
                  id="btn-rename"
                  onClick={() => set(userState, { ...val(userState), name: "Zastinian Updated" })}
                >
                  Rename User
                </button>
                <button
                  type="button"
                  id="btn-demote"
                  onClick={() => set(userState, { ...val(userState), role: "user" } as User)}
                >
                  Demote User
                </button>
              </nav>

              <main>
                <Switch fallback={<p>404</p>}>
                  <Match when={() => val(currentTab) === "home"}>{() => <Home />}</Match>
                  <Match when={() => val(currentTab) === "admin"}>{() => <Admin />}</Match>
                  <Match when={() => val(currentTab) === "profile"}>{() => <Profile />}</Match>
                </Switch>
              </main>
            </>
          )}
        </UserCtx.Provider>
      );
    }

    mount(App, root);

    // 1. Initial check (Home tab)
    expect(root.querySelector("#home-view")).not.toBeNull();
    const widgetButtons = root.querySelectorAll(".toggle-widget");
    expect(widgetButtons.length).toBe(2);

    // 2. Interaction in Home (Nested Show)
    (widgetButtons[0] as HTMLElement).click();
    expect(root.querySelector(".details")).not.toBeNull();
    expect(root.querySelector(".details")?.textContent).toContain("Weather");

    // 3. Navigation to Admin (Nested For, Switch/Match, Context)
    (root.querySelector("#btn-admin") as HTMLElement).click();
    expect(root.querySelector("#admin-view")).not.toBeNull();
    expect(root.querySelector("#admin-view")?.textContent).toContain("User: Zastinian");
    expect(root.querySelectorAll(".group-item").length).toBe(2);

    // 4. Update Context Value (Reactivity across components)
    (root.querySelector("#btn-rename") as HTMLElement).click();
    await forceFlush();
    expect(root.querySelector("#admin-view")?.textContent).toContain("User: Zastinian Updated");

    // 5. Update Context Value (Triggers Switch inside Admin)
    expect(root.querySelector(".groups-list")).not.toBeNull();
    (root.querySelector("#btn-demote") as HTMLElement).click();
    await forceFlush();
    expect(root.querySelector(".groups-list")).toBeNull();
    expect(root.querySelector("#restricted")).not.toBeNull();

    // 6. Navigation to Profile (Portal, Context)
    (root.querySelector("#btn-profile") as HTMLElement).click();
    expect(root.querySelector("#profile-view")).not.toBeNull();
    expect(root.querySelector("#profile-view")?.textContent).toContain("Zastinian Updated");

    (root.querySelector("#open-settings") as HTMLElement).click();
    await forceFlush();
    const portal = document.body.querySelector("#settings-portal");
    expect(portal).not.toBeNull();
    expect(portal?.textContent).toContain("Settings for Zastinian Updated");

    // 7. Test Portal Cleanup
    (document.body.querySelector("#close-settings") as HTMLElement).click();
    await forceFlush();
    expect(document.body.querySelector("#settings-portal")).toBeNull();

    // 8. Verify Tab switching back and forth
    (root.querySelector("#btn-home") as HTMLElement).click();
    expect(root.querySelector("#home-view")).not.toBeNull();
  });
});
