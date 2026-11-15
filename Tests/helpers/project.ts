import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Create isolated build fixtures using the existing installed workspace packages. */
export async function project(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), `hedystia-${prefix}-`));
  const framework = fileURLToPath(new URL("../../", import.meta.url));
  const link = async (name: string, source: string) => {
    const destination = join(root, "node_modules", name);
    await mkdir(dirname(destination), { recursive: true });
    await symlink(await realpath(join(framework, source)), destination, "dir");
  };
  await link("@hedystia/view", "Packages/view");
  await link("@hedystia/query", "Packages/query");
  await link("@hedystia/router", "Packages/router");
  await link("@hedystia/astro", "Packages/integrations/view/astro");
  await link("astro", "Packages/integrations/view/astro/node_modules/astro");
  await link("vite", "Packages/view/node_modules/vite");
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        jsxImportSource: "@hedystia/view",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: [],
      },
    }),
  );
  const write = async (file: string, contents: string) => {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
    return path;
  };
  return { root, write, dispose: () => rm(root, { recursive: true, force: true }) };
}
