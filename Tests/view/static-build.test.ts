import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getOwner, onCleanup, onMount, onReady, sig, val } from "@hedystia/view";
import { buildStatic } from "@hedystia/view/build";
import { Island, renderToString, serializeProps } from "@hedystia/view/server";
import { Fragment, jsx, jsxs } from "@hedystia/view/static/jsx-runtime";
import { describe, expect, it, vi } from "vitest";
import { project } from "../helpers/project";

describe("static server rendering", () => {
  it("renders deferred JSX and fragments with one disposable owner and no browser lifecycle work", async () => {
    const cleanup = vi.fn();
    const client = vi.fn();
    let runs = 0;
    const Component = () => {
      runs++;
      expect(getOwner()).not.toBeNull();
      onCleanup(cleanup);
      onMount(() => {
        client();
        return undefined;
      });
      onReady(client);
      const count = sig(3);
      return jsxs(Fragment, {
        children: [jsx("h1", { children: () => val(count) }), jsx("p", { children: "<safe>" })],
      });
    };
    const node = jsx(Component, {});
    expect(runs).toBe(0);
    expect(renderToString(node)).toBe("<h1>3</h1><p>&lt;safe&gt;</p>");
    expect(runs).toBe(1);
    expect(cleanup).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(client).not.toHaveBeenCalled();
    expect(getOwner()).toBeNull();
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    () => 1,
    new Date(),
    [undefined, 1],
  ])("rejects lossy island props %s", (value) => {
    expect(() => serializeProps({ value })).toThrow(TypeError);
  });

  it("rejects cyclic props and escapes executable text in serialized attributes", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => serializeProps(cycle)).toThrow(TypeError);
    const html = renderToString(
      jsx(Island, {
        component: ({ text }: { text: string }) => jsx("p", { children: text }),
        src: "src/Counter.tsx",
        props: { text: '"><script>bad()</script>' },
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("static production output", () => {
  it("emits only HTML when no interactive boundaries are declared", async () => {
    const fixture = await project("static");
    try {
      const result = await buildStatic({
        root: fixture.root,
        pages: [
          {
            path: "/",
            title: "Static & safe",
            render: () => jsx("h1", { children: "No client runtime" }),
          },
        ],
        viewTransitions: true,
      });
      const html = await readFile(result.pages[0]!, "utf8");
      expect(result.scripts).toEqual([]);
      expect(html).not.toContain("<script");
      expect(html).toContain("@view-transition{navigation:auto}");
      expect(html).toContain("Static &amp; safe");
      expect(await readdir(join(fixture.root, "dist"))).toEqual(["index.html"]);
    } finally {
      await fixture.dispose();
    }
  });

  it("ships static shell HTML and bundles only explicitly interactive component modules", async () => {
    const fixture = await project("islands");
    try {
      await fixture.write(
        "src/Counter.tsx",
        'import {sig,set,val} from "@hedystia/view"; import "./counter.css"; export default function Counter({initial}:{initial:number}) { const count=sig(initial); return <button onClick={()=>set(count,val(count)+1)}>Count: {()=>val(count)}</button>; }',
      );
      await fixture.write("src/counter.css", "button{color:rebeccapurple}");
      const ServerCounter = ({ initial }: { initial: number }) =>
        jsx("button", { children: `Count: ${initial}` });
      const result = await buildStatic({
        root: fixture.root,
        base: "/docs/",
        pages: [
          { path: "/", render: () => jsx("main", { children: "STATIC_SHELL_ONLY" }) },
          {
            path: "/counter",
            render: () =>
              jsxs("main", {
                children: [
                  jsx("h1", { children: "STATIC_HEADING_ONLY" }),
                  jsx(Island, {
                    component: ServerCounter,
                    src: "src/Counter.tsx",
                    props: { initial: 2 },
                    when: "visible",
                  }),
                ],
              }),
          },
        ],
      });
      const staticHTML = await readFile(result.pages[0]!, "utf8");
      const interactive = await readFile(result.pages[1]!, "utf8");
      expect(staticHTML).not.toContain("<script");
      expect(staticHTML).not.toContain("stylesheet");
      expect(interactive).toContain("Count: 2");
      expect(interactive).toContain('data-view-when="visible"');
      expect(interactive).toContain('src="/docs/assets/');
      expect(interactive).toContain("stylesheet");
      const assets = await readdir(join(fixture.root, "dist/assets"));
      const code = (
        await Promise.all(
          assets
            .filter((file) => file.endsWith(".js"))
            .map((file) => readFile(join(fixture.root, "dist/assets", file), "utf8")),
        )
      ).join("\n");
      expect(code).not.toContain("STATIC_SHELL_ONLY");
      expect(code).not.toContain("STATIC_HEADING_ONLY");
      expect(code).not.toContain("renderToString");
    } finally {
      await fixture.dispose();
    }
  }, 30_000);

  it("rejects traversal, duplicate output paths and project-root output directories", async () => {
    const fixture = await project("unsafe-build");
    try {
      await expect(buildStatic({ root: fixture.root, outDir: ".", pages: [] })).rejects.toThrow(
        "outDir",
      );
      await expect(buildStatic({ root: fixture.root, outDir: "..", pages: [] })).rejects.toThrow(
        "outDir",
      );
      await expect(
        buildStatic({
          root: fixture.root,
          pages: [{ path: "/%2e%2e/private", render: () => "no" }],
        }),
      ).rejects.toThrow("traverse");
      await expect(
        buildStatic({
          root: fixture.root,
          pages: [
            { path: "/same", render: () => "a" },
            { path: "/same/", render: () => "b" },
          ],
        }),
      ).rejects.toThrow("Duplicate");
    } finally {
      await fixture.dispose();
    }
  });
});
