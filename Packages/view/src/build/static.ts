import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { build, type Plugin } from "vite";
import { renderToString } from "../server/render";
import { collectIslands } from "../server/state";

export type StaticPage = { path: string; render: () => unknown; title?: string };
export type StaticBuildOptions = {
  pages: readonly StaticPage[];
  root?: string;
  outDir?: string;
  base?: string;
  viewTransitions?: boolean;
};

/** Escape text for generated HTML attributes and page titles. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build static HTML pages, bundling JavaScript only for explicitly declared Island modules. */
export async function buildStatic(
  options: StaticBuildOptions,
): Promise<{ pages: string[]; scripts: string[] }> {
  const root = await realpath(resolve(options.root ?? process.cwd()));
  const outDir = resolve(root, options.outDir ?? "dist");
  const outputRelative = relative(root, outDir);
  if (
    !outputRelative ||
    outputRelative === ".." ||
    outputRelative.startsWith(`..${sep}`) ||
    isAbsolute(outputRelative)
  ) {
    throw new TypeError("outDir must be a directory inside the project root");
  }
  const guard = async (target: string) => {
    let path = root;
    for (const part of relative(root, target).split(sep)) {
      path = resolve(path, part);
      try {
        if ((await lstat(path)).isSymbolicLink()) {
          throw new TypeError("Static output paths cannot follow symlinks");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  };
  await guard(outDir);
  await guard(resolve(outDir, "assets"));
  const base = options.base ?? "/";
  if (!base.startsWith("/") || base.startsWith("//") || /[?#\\]/.test(base)) {
    throw new TypeError("base must be a local URL path");
  }
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const modules = new Map<string, string>();
  const generated: { file: string; body: string; title: string; interactive: boolean }[] = [];
  const paths = new Set<string>();
  for (const page of options.pages) {
    if (!page.path.startsWith("/") || /[?#\\]|%2f|%5c/i.test(page.path)) {
      throw new TypeError(`Invalid static path: ${page.path}`);
    }
    const pieces = page.path.split("/").filter(Boolean).map(decodeURIComponent);
    if (
      pieces.some(
        (part) =>
          part === "." ||
          part === ".." ||
          part.includes("/") ||
          part.includes("\\") ||
          part.includes("\0"),
      )
    ) {
      throw new TypeError("Static paths cannot traverse directories");
    }
    const file = resolve(outDir, ...pieces, "index.html");
    if (paths.has(file)) {
      throw new TypeError(`Duplicate static path: ${page.path}`);
    }
    await guard(file);
    paths.add(file);
    let interactive = false;
    const body = collectIslands(
      (source) => {
        if (!modules.has(source)) {
          modules.set(source, `m${modules.size}`);
        }
        interactive = true;
        return modules.get(source)!;
      },
      () =>
        renderToString(() => {
          const result = page.render();
          if (result && typeof result === "object" && "then" in result) {
            throw new TypeError(
              "Static page render callbacks must be synchronous; load data before buildStatic",
            );
          }
          return result;
        }),
    );
    generated.push({ file, body, title: page.title ?? "", interactive });
  }
  let entry: string | undefined;
  const styles = new Set<string>();
  if (modules.size) {
    const imports: string[] = [];
    for (const [source, id] of modules) {
      const module = await realpath(resolve(root, source.replace(/^\//, "")));
      if (relative(root, module).startsWith(`..${sep}`) || isAbsolute(relative(root, module))) {
        throw new TypeError("Island modules must be inside the project root");
      }
      imports.push(`${JSON.stringify(id)}: () => import(${JSON.stringify(module)})`);
    }
    const bootstrap = `import { hydrateIslands } from "@hedystia/view/islands";\nhydrateIslands({${imports.join(",")}});`;
    const plugin: Plugin = {
      name: "@hedystia/view:static-islands",
      resolveId(id) {
        if (id === "virtual:hedystia-islands") {
          return "\0hedystia-islands";
        }
      },
      load(id) {
        if (id === "\0hedystia-islands") {
          return bootstrap;
        }
      },
    };
    const result = await build({
      root,
      base: prefix,
      configFile: false,
      logLevel: "silent",
      publicDir: false,
      plugins: [plugin],
      oxc: { jsx: { runtime: "automatic", importSource: "@hedystia/view" } },
      build: {
        outDir,
        emptyOutDir: false,
        cssCodeSplit: false,
        rollupOptions: { input: "virtual:hedystia-islands" },
      },
    });
    for (const bundle of Array.isArray(result) ? result : [result]) {
      if (!("output" in bundle)) {
        throw new Error("Static island builds cannot run in watch mode");
      }
      for (const asset of bundle.output) {
        if (asset.type === "chunk" && asset.isEntry) {
          entry = `${prefix}${asset.fileName}`;
        }
        if (asset.type === "asset" && asset.fileName.endsWith(".css")) {
          styles.add(`${prefix}${asset.fileName}`);
        }
      }
    }
    if (!entry) {
      throw new Error("The island build did not produce a browser entry");
    }
  }
  for (const page of generated) {
    const css = page.interactive
      ? [...styles].map((style) => `<link rel="stylesheet" href="${escape(style)}">`).join("")
      : "";
    const transition = options.viewTransitions
      ? "<style>@view-transition{navigation:auto}</style>"
      : "";
    const script = page.interactive
      ? `<script type="module" src="${escape(entry!)}"></script>`
      : "";
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title)}</title>${transition}${css}</head><body>${page.body}${script}</body></html>`;
    await mkdir(resolve(page.file, ".."), { recursive: true });
    await writeFile(page.file, html);
  }
  return { pages: generated.map((page) => page.file), scripts: entry ? [entry] : [] };
}
