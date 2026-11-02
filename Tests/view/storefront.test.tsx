/** @vitest-environment happy-dom */
/** @jsxImportSource @hedystia/view */
import {
  action,
  batch,
  ErrorBoundary,
  For,
  forceFlush,
  load,
  merge,
  mount,
  onCleanup,
  once,
  onMount,
  onReady,
  Portal,
  patch,
  reset,
  Show,
  Suspense,
  set,
  sig,
  snap,
  store,
  toCssString,
  val,
  watchAll,
} from "@hedystia/view";
import { beforeEach, describe, expect, it } from "vitest";

interface Product {
  id: string;
  name: string;
  price: number;
}

const CATALOG: Product[] = [
  { id: "p1", name: "Teclado", price: 50 },
  { id: "p2", name: "Monitor", price: 200 },
  { id: "p3", name: "Mouse", price: 25 },
];

interface CartEntry {
  name: string;
  price: number;
}

describe("Storefront page journey", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById("root")!;
  });

  it("starts as an empty state and hydrates the catalog through load()", async () => {
    const cart = store({ entries: [] as CartEntry[] });

    function Badge() {
      return (
        <span id="cart-badge">
          {() =>
            val(cart.entries as any as any[]).length === 0
              ? "Carrito vacío"
              : `${val(cart.entries as any as any[]).length} artículos`
          }
        </span>
      );
    }

    function Catalog() {
      const resource = load(
        () => "products",
        async () => CATALOG,
      );
      return (
        <Show when={() => !val(resource.loading)} fallback={<p id="catalog-loading">Cargando…</p>}>
          {() => (
            <ul id="catalog">
              <For each={() => val(resource.data)} key={(product: Product) => product.id}>
                {(product) => (
                  <li class="product" data-id={product.id}>
                    <span class="product-name">{product.name}</span>
                    <button
                      type="button"
                      class="add-to-cart"
                      onClick={() => {
                        batch(() => {
                          patch(cart, {
                            entries: [...val(cart.entries as any as CartEntry[]), product],
                          });
                        });
                      }}
                    >
                      Añadir · ${product.price}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          )}
        </Show>
      );
    }

    function App() {
      return (
        <div id="storefront">
          <header>
            <h1>Tienda</h1>
            <Badge />
          </header>
          <main>
            <Catalog />
          </main>
        </div>
      );
    }

    const app = mount(App, root);

    expect(root.querySelector("#catalog-loading")).not.toBeNull();
    expect(root.querySelector("#cart-badge")?.textContent).toBe("Carrito vacío");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(root.querySelector("#catalog-loading")).toBeNull();
    expect(root.querySelectorAll(".product").length).toBe(3);

    const addButtons = root.querySelectorAll(".add-to-cart");
    (addButtons[0] as HTMLElement).click();
    await forceFlush();
    expect(root.querySelector("#cart-badge")?.textContent).toBe("1 artículos");

    (addButtons[1] as HTMLElement).click();
    await forceFlush();
    expect(root.querySelector("#cart-badge")?.textContent).toBe("2 artículos");
    expect(snap(cart).entries).toEqual([
      { id: "p1", name: "Teclado", price: 50 },
      { id: "p2", name: "Monitor", price: 200 },
    ]);

    app.dispose();
    expect(root.innerHTML).toBe("");
  });

  it("keeps the shipping form in sync with store, patch, snap, reset and watchAll", async () => {
    const formStore = store({
      name: "",
      zip: "",
      expedited: false,
    });

    const snapshots: Record<string, unknown>[] = [];
    const stop = watchAll(
      [(formStore as any).name, (formStore as any).zip, (formStore as any).expedited],
      () => {
        snapshots.push(snap(formStore));
      },
    );

    expect(snapshots.length).toBe(1);
    expect(snapshots[0]).toEqual({ name: "", zip: "", expedited: false });

    patch(formStore, { name: "Zastinian", zip: "12345" });
    expect(snapshots.length).toBe(2);
    expect(snapshots[1]).toEqual({ name: "Zastinian", zip: "12345", expedited: false });
    expect(snap(formStore)).toEqual({ name: "Zastinian", zip: "12345", expedited: false });

    patch(formStore, { expedited: true });
    expect(snap(formStore).expedited).toBe(true);

    reset(formStore, { name: "", zip: "", expedited: false });
    expect(snap(formStore)).toEqual({ name: "", zip: "", expedited: false });
    expect(snapshots.length).toBe(4);

    stop();
  });

  it("runs the checkout action through success and failure paths", async () => {
    let shouldFail = false;
    const checkout = action(async (payload: { items: number; total: number }) => {
      if (shouldFail) {
        throw new Error("Pasarela fuera de servicio");
      }
      return { orderId: "ord-1", ...payload };
    });

    expect(val(checkout.loading)).toBe(false);

    const receipt = await checkout.run({ items: 2, total: 250 });
    expect(receipt.orderId).toBe("ord-1");
    expect(val(checkout.data)).toEqual({ orderId: "ord-1", items: 2, total: 250 });
    expect(val(checkout.loading)).toBe(false);
    expect(val(checkout.error)).toBeUndefined();

    shouldFail = true;
    await expect(checkout.run({ items: 1, total: 50 })).rejects.toThrow(
      "Pasarela fuera de servicio",
    );
    expect(val(checkout.error)?.message).toBe("Pasarela fuera de servicio");
    expect(val(checkout.loading)).toBe(false);
  });

  it("renders reactive inline styles and tone classList", async () => {
    const tone = sig<"light" | "dark">("light");
    const accent = sig("#ff6600");

    function CartPanel() {
      return (
        <aside
          id="cart-panel"
          classList={{
            compact: () => val(tone) === "dark",
            expanded: () => val(tone) === "light",
          }}
          style={() => ({ borderColor: val(accent), padding: "8px" })}
        >
          Panel
        </aside>
      );
    }

    mount(CartPanel, root);
    await forceFlush();

    const panel = root.querySelector("#cart-panel") as HTMLElement;
    expect(panel.className).toContain("expanded");
    expect(panel.className).not.toContain("compact");
    expect(panel.getAttribute("style")).toContain("border-color");
    expect(panel.getAttribute("style")).toContain("#ff6600");

    set(tone, "dark");
    await forceFlush();
    expect(panel.className).toContain("compact");
    expect(panel.className).not.toContain("expanded");

    set(accent, "#00ccff");
    await forceFlush();
    expect(panel.getAttribute("style")).toContain("#00ccff");

    const sheet = merge({ color: "red" }, { fontWeight: 600 } as any);
    expect(toCssString(sheet as any)).toContain("color: red");
    expect(toCssString(sheet as any)).toContain("font-weight: 600");
  });

  it("catches a defective row with ErrorBoundary and restores it on retry", async () => {
    const defective = sig(true);

    mount(() => {
      return (
        <section>
          <ErrorBoundary
            fallback={(error: Error, retry: () => void) => (
              <div id="row-fallback">
                <p id="row-error">{error.message}</p>
                <button
                  type="button"
                  id="repair-row"
                  onClick={() => {
                    set(defective, false);
                    retry();
                  }}
                >
                  Reparar
                </button>
              </div>
            )}
          >
            {() => {
              if (val(defective)) {
                throw new Error("Fila rota: id p404");
              }
              return <div id="row-ok">Contenido restablecido</div>;
            }}
          </ErrorBoundary>
        </section>
      );
    }, root);
    await forceFlush();

    expect(root.querySelector("#row-fallback")).not.toBeNull();
    expect(root.querySelector("#row-error")?.textContent).toBe("Fila rota: id p404");
    expect(root.querySelector("#row-ok")).toBeNull();

    (root.querySelector("#repair-row") as HTMLElement).click();
    await forceFlush();

    expect(root.querySelector("#row-fallback")).toBeNull();
    expect(root.querySelector("#row-ok")?.textContent).toBe("Contenido restablecido");
  });

  it("swaps Suspense fallback while the slotted content is throwing", async () => {
    mount(() => {
      return (
        <div>
          <Suspense fallback={<p id="suspense-fallback">Recuperando…</p>}>
            {() => {
              throw new Error("flujo pendiente");
            }}
          </Suspense>
          <Suspense>{() => <div id="healthy-content">Sano</div>}</Suspense>
        </div>
      );
    }, root);
    await forceFlush();

    expect(root.querySelector("#suspense-fallback")?.textContent).toBe("Recuperando…");
    expect(root.querySelector("#healthy-content")?.textContent).toBe("Sano");
  });

  it("fires onMount synchronously, onReady at microtask and cleans up through dispose", async () => {
    const events: string[] = [];

    function Counter() {
      onMount(() => {
        events.push("mounted");
      });
      onReady(() => {
        events.push("ready");
      });
      onCleanup(() => {
        events.push("cleaned");
      });
      return <div id="counter">0</div>;
    }

    const app = mount(Counter, root);

    expect(events).toContain("mounted");
    expect(events).not.toContain("ready");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["mounted", "ready"]);

    app.dispose();
    expect(events[events.length - 1]).toBe("cleaned");
  });

  it("shows a transient confirmation toast through a Portal", async () => {
    const toastOpen = sig(false);

    mount(() => {
      return (
        <div>
          <button type="button" id="buy" onClick={() => set(toastOpen, true)}>
            Comprar
          </button>
          <Show when={() => val(toastOpen)}>
            {() => (
              <Portal>
                <div id="toast-portal" role="status">
                  <span>¡Compra confirmada!</span>
                </div>
              </Portal>
            )}
          </Show>
        </div>
      );
    }, root);

    expect(document.body.querySelector("#toast-portal")).toBeNull();

    (root.querySelector("#buy") as HTMLElement).click();
    await forceFlush();
    expect(document.body.querySelector("#toast-portal")).not.toBeNull();
    expect(document.body.querySelector("#toast-portal")?.textContent).toContain(
      "¡Compra confirmada!",
    );
  });

  it("triggers once() watchers exactly one time during a session", async () => {
    const firstVisit = sig(true);
    const fired: string[] = [];

    once(
      () => val(firstVisit),
      () => {
        fired.push("welcome");
      },
    );

    set(firstVisit, false);
    set(firstVisit, true);
    set(firstVisit, false);
    set(firstVisit, true);

    expect(fired).toEqual(["welcome"]);
  });
});
