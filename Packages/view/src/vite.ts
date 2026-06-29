import type { Plugin, UserConfig } from "vite";

const CSS_RE = /\.css$/;

export interface ViewPluginOptions {
  include?: string[];
  exclude?: string[];
}

export interface ViewPluginResult {
  plugins: Plugin[];
  collectedCSS: Map<string, string>;
}

export function viewPlugin(options: ViewPluginOptions = {}): ViewPluginResult {
  const collectedCSS = new Map<string, string>();

  const plugins: Plugin[] = [viewJSXPlugin(options), viewCSSCollectorPlugin(collectedCSS)];

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

function viewCSSCollectorPlugin(collectedCSS: Map<string, string>): Plugin {
  return {
    name: "@hedystia/view:css-collector",
    enforce: "pre",
    transform(code, id) {
      if (!CSS_RE.test(id)) {
        return;
      }
      collectedCSS.set(id.replace(/\\/g, "/"), code);
    },
  };
}
