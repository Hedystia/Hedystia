import type { Plugin, UserConfig } from "vite";

export interface ViewPluginOptions {
  include?: string[];
  exclude?: string[];
}

export interface ViewPluginResult {
  plugins: Plugin[];
}

export function viewPlugin(options: ViewPluginOptions = {}): ViewPluginResult {
  const plugins: Plugin[] = [viewJSXPlugin(options)];

  return { plugins };
}

function viewJSXPlugin(_options: ViewPluginOptions): Plugin {
  return {
    name: "@hedystia/view:jsx",
    config(): UserConfig {
      return {
        oxc: {
          jsx: {
            runtime: "automatic",
            importSource: "@hedystia/view",
          },
        },
      };
    },
  };
}
