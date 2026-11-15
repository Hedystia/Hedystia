import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

export type GeneratorOptions = {
  routesDirectory?: string;
  generatedRouteTree?: string;
  root?: string;
};
type FileRoute = {
  file: string;
  key: string;
  path: string | null;
  folder: string;
  layout: boolean;
  variable: string;
};

/** Discover supported route modules without executing application code or following symlinks. */
async function discover(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (entry.name.startsWith(".") || entry.name.startsWith("-")) {
      continue;
    }
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await discover(resolve(directory, entry.name), key)));
    } else if (
      entry.isFile() &&
      /\.(?:tsx?|jsx?)$/.test(entry.name) &&
      !/\.(?:test|spec|d)\.[^.]+$/.test(entry.name)
    ) {
      files.push(key);
    }
  }
  return files;
}

/** Generate a deterministic, lazy route tree and literal path declarations from route files. */
export async function generateRoutes(
  options: GeneratorOptions = {},
): Promise<{ file: string; changed: boolean; paths: string[] }> {
  const root = resolve(options.root ?? process.cwd());
  const directory = resolve(root, options.routesDirectory ?? "src/routes");
  const output = resolve(root, options.generatedRouteTree ?? "src/routeTree.gen.ts");
  const modules = (await discover(directory)).filter((file) => resolve(directory, file) !== output);
  const routes: FileRoute[] = modules.map((file, index) => {
    const key = file.slice(0, -extname(file).length).replace(/\./g, "/");
    const pieces = key.split("/");
    const name = pieces.pop()!;
    const layout = name === "_layout" || name === "__root";
    if (name === "__root" && pieces.length) {
      throw new TypeError("__root must be at the routes root");
    }
    if (pieces.some((piece) => piece.startsWith("_"))) {
      throw new TypeError("Use _layout modules for pathless layouts, not underscored directories");
    }
    const path = layout
      ? null
      : `/${[...pieces, ...(name === "index" ? [] : [name])].join("/")}${name === "index" && pieces.length ? "/" : ""}`;
    return { file, key, path, folder: pieces.join("/"), layout, variable: `route${index}` };
  });
  const paths = new Set<string>();
  const layouts = new Set<string>();
  for (const route of routes) {
    const set = route.layout ? layouts : paths;
    const key = route.layout ? route.folder : route.path!;
    if (set.has(key)) {
      throw new TypeError(`Duplicate file route: ${key}`);
    }
    set.add(key);
  }
  const children = new Map<FileRoute | undefined, FileRoute[]>();
  for (const route of routes) {
    const parents = routes
      .filter(
        (candidate) =>
          candidate !== route &&
          (candidate.layout
            ? (!candidate.folder || route.key.startsWith(`${candidate.folder}/`)) &&
              (candidate.folder !== route.folder || !route.layout)
            : route.key.startsWith(`${candidate.key}/`) && !candidate.key.endsWith("/index")),
      )
      .sort(
        (a, b) =>
          (b.layout
            ? b.folder
              ? b.folder.split("/").length + 0.5
              : -1
            : b.key.split("/").length) -
          (a.layout ? (a.folder ? a.folder.split("/").length + 0.5 : -1) : a.key.split("/").length),
      );
    const parent = parents[0];
    children.set(parent, [...(children.get(parent) ?? []), route]);
  }
  const imports = routes.map((route) => {
    let specifier = relative(dirname(output), resolve(directory, route.file))
      .split(sep)
      .join("/")
      .replace(/\.[^.]+$/, "");
    if (!specifier.startsWith(".")) {
      specifier = `./${specifier}`;
    }
    return `const ${route.variable} = lazyRoute(${JSON.stringify(route.path)}, () => import(${JSON.stringify(specifier)}), ${JSON.stringify(route.key)});`;
  });
  const render = (route: FileRoute): string => {
    const nested = children.get(route);
    return nested?.length
      ? `${route.variable}.addChildren([${nested.map(render).join(", ")}])`
      : route.variable;
  };
  const content = `"@hedystia/router generated route tree";\nimport { lazyRoute } from "@hedystia/router";\n\n${imports.join("\n")}\n\nexport const routeTree = [${(children.get(undefined) ?? []).map(render).join(", ")}] as const;\nexport type FileRoutePath = ${
    [...paths]
      .sort()
      .map((path) => JSON.stringify(path))
      .join(" | ") || "never"
  };\n`;
  let previous: string | undefined;
  try {
    previous = await readFile(output, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  if (previous !== undefined && !previous.startsWith('"@hedystia/router generated route tree";')) {
    throw new Error("Refusing to overwrite a non-generated route tree");
  }
  if (previous === content) {
    return { file: output, changed: false, paths: [...paths].sort() };
  }
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  return { file: output, changed: true, paths: [...paths].sort() };
}
