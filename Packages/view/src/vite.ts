import { matchesGlob } from "node:path";
import { type Plugin, transformWithOxc } from "vite";

export interface ViewPluginOptions {
  include?: string[];
  exclude?: string[];
}

export interface ViewPluginResult {
  plugins: Plugin[];
}

/** Compile selected JSX modules separately for the browser and static server renderer. */
export function viewPlugin(options: ViewPluginOptions = {}): ViewPluginResult {
  const selected = (id: string) => {
    const file = id.split("?")[0]!.replace(/\\/g, "/");
    const matches = (pattern: string) => matchesGlob(file, pattern) || file.includes(pattern);
    return (
      /\.[jt]sx$/.test(file) &&
      (!options.include?.length || options.include.some(matches)) &&
      !options.exclude?.some(matches)
    );
  };
  const plugin: Plugin = {
    name: "@hedystia/view:jsx",
    enforce: "pre",
    transform: {
      filter: { id: /\.[jt]sx(?:\?|$)/ },
      async handler(code, id, transformOptions) {
        if (!selected(id) || /@jsxImportSource\s+(?!@hedystia\/view\b)/.test(code)) {
          return;
        }
        const server = transformOptions?.ssr || this.environment?.config.consumer === "server";
        return transformWithOxc(code, id, {
          jsx: {
            runtime: "automatic",
            importSource: server ? "@hedystia/view/static" : "@hedystia/view",
          },
          sourcemap: true,
        });
      },
    },
  };
  return { plugins: [plugin] };
}
