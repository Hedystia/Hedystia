import type { Plugin, UserConfig } from "vite";

export interface ViewPluginOptions {
  include?: string[];
  exclude?: string[];
}

export interface ViewPluginResult {
  plugins: Plugin[];
  /**
   * @deprecated Kept for backwards compatibility. CSS imported by View
   * components is emitted by the host bundler (Vite/Astro) through the normal
   * module graph, so manual collection is no longer needed and this map is
   * always empty.
   */
  collectedCSS: Map<string, string>;
}

export function viewPlugin(options: ViewPluginOptions = {}): ViewPluginResult {
  const collectedCSS = new Map<string, string>();

  const plugins: Plugin[] = [viewJSXPlugin(options)];

  return { plugins, collectedCSS };
}

function viewJSXPlugin(_options: ViewPluginOptions): Plugin {
  return {
    name: "@hedystia/view:jsx",
    config(): UserConfig {
      return {
        esbuild: {
          jsx: "automatic",
          jsxImportSource: "@hedystia/view",
        },
      };
    },
  };
}
